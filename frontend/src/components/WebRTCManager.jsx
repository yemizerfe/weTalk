import { useEffect, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import useWebRTC from '../hooks/useWebRTC';

const WebRTCManager = () => {
  const {
    activeCall,
    callStatus,
    callRole,
    incomingCall,
    activeConversation,
    setLocalStream,
    setRemoteStream
  } = useChatStore();
  
  const webRTCRef = useRef(null);
  const hasSetupRef = useRef(false);

  const { setupPeerConnection, cleanup } = useWebRTC(activeCall);

  // Initialize WebRTC when call starts
  useEffect(() => {
    if (!activeCall || callStatus !== 'in-progress' || hasSetupRef.current) {
      return;
    }

    const initializeCall = async () => {
      try {
        console.log('Initializing WebRTC for call:', activeCall.callId);
        
        // Determine if we're the caller (initiator) or callee
        const isCaller = callRole === 'caller';
        
        // Setup peer connection
        const success = await setupPeerConnection(isCaller);
        
        if (success) {
          console.log('WebRTC setup successful');
          hasSetupRef.current = true;
        } else {
          console.error('Failed to setup WebRTC');
          // Handle setup failure
        }
      } catch (error) {
        console.error('Error initializing WebRTC:', error);
        cleanup();
      }
    };

    initializeCall();

    return () => {
      // Cleanup when component unmounts or call ends
      if (hasSetupRef.current) {
        cleanup();
        hasSetupRef.current = false;
      }
    };
  }, [activeCall, callStatus, callRole, incomingCall, setupPeerConnection, cleanup]);

  // Request camera/mic permissions when conversation is active
  useEffect(() => {
    if (!activeConversation || callStatus !== 'idle') {
      return;
    }

    // Pre-request permissions for better UX
    const preRequestPermissions = async () => {
      try {
        // Just check if we can access devices, don't actually get stream
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasAudio = devices.some(device => device.kind === 'audioinput');
        const hasVideo = devices.some(device => device.kind === 'videoinput');
        
        console.log('Available devices:', {
          audioInputs: devices.filter(d => d.kind === 'audioinput').length,
          videoInputs: devices.filter(d => d.kind === 'videoinput').length
        });

        // Store device availability
        localStorage.setItem('hasAudioDevice', hasAudio);
        localStorage.setItem('hasVideoDevice', hasVideo);
      } catch (error) {
        console.warn('Error checking media devices:', error);
      }
    };

    preRequestPermissions();
  }, [activeConversation, callStatus]);

  // Handle call status changes
  useEffect(() => {
    if (callStatus === 'ending' || callStatus === 'idle') {
      // Cleanup when call ends
      cleanup();
      hasSetupRef.current = false;
      
      // Reset streams
      setLocalStream(null);
      setRemoteStream(null);
    }
  }, [callStatus, cleanup, setLocalStream, setRemoteStream]);

  // Handle window close/beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (callStatus === 'in-progress') {
        cleanup();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [callStatus, cleanup]);

  // Handle visibility change (tab switch)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && callStatus === 'in-progress') {
        console.log('Tab became hidden, pausing video tracks');
        const { localStream } = useChatStore.getState();
        if (localStream) {
          localStream.getVideoTracks().forEach(track => {
            track.enabled = false;
          });
        }
      } else if (!document.hidden && callStatus === 'in-progress') {
        console.log('Tab became visible, resuming video tracks');
        const { localStream, isVideoEnabled } = useChatStore.getState();
        if (localStream) {
          localStream.getVideoTracks().forEach(track => {
            track.enabled = isVideoEnabled;
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [callStatus]);

  // Monitor connection quality
  useEffect(() => {
    if (!activeCall || callStatus !== 'in-progress') return;

    const monitorConnection = () => {
      const { peerConnection } = useChatStore.getState();
      if (!peerConnection) return;

      const stats = peerConnection.getStats();
      stats.then((results) => {
        // Analyze connection stats
        results.forEach((report) => {
          if (report.type === 'candidate-pair' && report.nominated) {
            const rtt = report.currentRoundTripTime;
            const bytesSent = report.bytesSent;
            const bytesReceived = report.bytesReceived;
            
            // Log quality metrics
            if (rtt > 500) {
              console.warn('High latency detected:', rtt);
            }
            
            if (bytesSent === 0 && bytesReceived === 0) {
              console.warn('No data transfer detected');
            }
          }
        });
      }).catch(console.error);
    };

    const interval = setInterval(monitorConnection, 10000); // Every 10 seconds
    
    return () => clearInterval(interval);
  }, [activeCall, callStatus]);

  // This component doesn't render anything
  return null;
};

export default WebRTCManager;