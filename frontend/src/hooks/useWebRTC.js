import { useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';

const useWebRTC = (activeCall) => {
  const {
    setLocalStream,
    setRemoteStream,
    setPeerConnection,
    setVideoEnabled,
    sendWebRTCSignal,
    setWebRTCSignalHandler
  } = useChatStore();
  
  const { user } = useAuthStore();
  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  const localCandidatesRef = useRef([]);
  const pendingSignalsRef = useRef([]);
  const peerReadyRef = useRef(false);

  // Configuration for WebRTC
  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      // For production, add TURN servers for better connectivity:
      // {
      //   urls: 'turn:your-turn-server.com:3478',
      //   username: 'username',
      //   credential: 'password'
      // }
    ],
    iceCandidatePoolSize: 10
  };

  // Initialize local media stream
  const initLocalStream = useCallback(async (isVideoCall = false) => {
    try {
      const constraints = {
        audio: true,
        video: isVideoCall ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        } : false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      setVideoEnabled(isVideoCall && stream.getVideoTracks().some(track => track.enabled));
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      throw error;
    }
  }, [setLocalStream, setVideoEnabled]);

  const setupDataChannel = useCallback((channel) => {
    channel.onopen = () => {
      console.log('Data channel opened');
    };
    channel.onmessage = (event) => {
      console.log('Data channel message:', event.data);
    };
    channel.onclose = () => {
      console.log('Data channel closed');
    };
  }, []);

  // Create peer connection
  const createPeerConnection = useCallback((isCaller, callId) => {
    try {
      const peerConnection = new RTCPeerConnection(configuration);
      peerConnectionRef.current = peerConnection;
      setPeerConnection(peerConnection);

      // Set up event handlers
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          sendWebRTCSignal(callId, 'candidate', event.candidate);
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', peerConnection.iceConnectionState);
        
        if (peerConnection.iceConnectionState === 'failed' ||
            peerConnection.iceConnectionState === 'disconnected' ||
            peerConnection.iceConnectionState === 'closed') {
          console.warn('ICE connection failed or closed');
        }
      };

      peerConnection.onsignalingstatechange = () => {
        console.log('Signaling state:', peerConnection.signalingState);
      };

      peerConnection.ontrack = (event) => {
        console.log('Received remote track');
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        }
      };

      // Callee: listen for the data channel created by the caller
      peerConnection.ondatachannel = (event) => {
        console.log('Received remote data channel');
        dataChannelRef.current = event.channel;
        setupDataChannel(event.channel);
      };

      // Caller: create data channel
      if (isCaller) {
        const channel = peerConnection.createDataChannel('chat');
        dataChannelRef.current = channel;
        setupDataChannel(channel);
      }

      return peerConnection;
    } catch (error) {
      console.error('Error creating peer connection:', error);
      throw error;
    }
  }, [sendWebRTCSignal, setPeerConnection, setRemoteStream, setupDataChannel]);

  // Create offer (caller side)
  const createOffer = useCallback(async (callId, callType) => {
    try {
      if (!peerConnectionRef.current) {
        console.error('No peer connection available');
        return;
      }

      const offer = await peerConnectionRef.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === 'video'
      });

      await peerConnectionRef.current.setLocalDescription(offer);
      sendWebRTCSignal(callId, 'offer', offer);
      
      return offer;
    } catch (error) {
      console.error('Error creating offer:', error);
      throw error;
    }
  }, [sendWebRTCSignal]);

  // Create answer (callee side)
  const createAnswer = useCallback(async (callId, offer) => {
    try {
      if (!peerConnectionRef.current) {
        console.error('No peer connection available');
        return;
      }

      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      
      // Add any pending ICE candidates
      while (localCandidatesRef.current?.length > 0) {
        const candidate = localCandidatesRef.current.shift();
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }

      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      sendWebRTCSignal(callId, 'answer', answer);
      
      return answer;
    } catch (error) {
      console.error('Error creating answer:', error);
      throw error;
    }
  }, [sendWebRTCSignal]);

  // Handle incoming offer
  const handleOffer = useCallback(async (callId, offer) => {
    try {
      await createAnswer(callId, offer);
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }, [createAnswer]);

  // Handle incoming answer
  const handleAnswer = useCallback(async (answer) => {
    try {
      if (!peerConnectionRef.current) {
        console.error('No peer connection available');
        return;
      }

      const remoteDesc = new RTCSessionDescription(answer);
      await peerConnectionRef.current.setRemoteDescription(remoteDesc);
      
      // Add any pending ICE candidates
      while (localCandidatesRef.current?.length > 0) {
        const candidate = localCandidatesRef.current.shift();
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }, []);

  // Handle ICE candidate
  const handleICECandidate = useCallback(async (candidate) => {
    try {
      if (!peerConnectionRef.current) {
        console.error('No peer connection available');
        return;
      }

      // If remote description is not set yet, queue the candidate
      if (peerConnectionRef.current.remoteDescription === null) {
        if (!localCandidatesRef.current) localCandidatesRef.current = [];
        localCandidatesRef.current.push(candidate);
        return;
      }

      await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }, []);

  // Handle WebRTC signals
  const handleWebRTCSignal = useCallback((signal) => {
    if (!peerConnectionRef.current || !peerReadyRef.current) {
      pendingSignalsRef.current.push(signal);
      return;
    }

    const { signalType, signalData } = signal;

    switch (signalType) {
      case 'offer': {
        const callId = signal.callId;
        handleOffer(callId, signalData);
        break;
      }
      case 'answer':
        handleAnswer(signalData);
        break;
      case 'candidate':
        handleICECandidate(signalData);
        break;
      case 'end':
        console.log('Received end signal');
        break;
      default:
        console.warn('Unknown signal type:', signalType);
    }
  }, [handleOffer, handleAnswer, handleICECandidate]);

  // Set up peer connection with media tracks
  const setupPeerConnection = useCallback(async (isCaller = false) => {
    try {
      if (!activeCall) {
        console.error('No active call provided');
        return false;
      }

      const callId = activeCall.callId || activeCall.id;
      const callType = activeCall.callType || activeCall.type || 'audio';

      // Initialize local stream
      const localStream = await initLocalStream(callType === 'video');
      
      // Create peer connection
      const peerConnection = createPeerConnection(isCaller, callId);
      
      // Add local tracks to peer connection
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
      peerReadyRef.current = true;

      // The caller's offer can arrive before the callee finishes acquiring media.
      const pendingSignals = pendingSignalsRef.current.splice(0);
      for (const signal of pendingSignals) {
        await handleWebRTCSignal(signal);
      }

      // If caller, create offer
      if (isCaller) {
        await createOffer(callId, callType);
      }

      return true;
    } catch (error) {
      console.error('Error setting up peer connection:', error);
      return false;
    }
  }, [activeCall, initLocalStream, createPeerConnection, createOffer]);

  // Clean up WebRTC resources
  const cleanup = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      setPeerConnection(null);
    }

    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }

    // Stop local stream tracks
    const { localStream } = useChatStore.getState();
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }

    // Clear pending candidates
    if (localCandidatesRef.current) {
      localCandidatesRef.current = [];
    }
    pendingSignalsRef.current = [];
    peerReadyRef.current = false;

    setLocalStream(null);
    setRemoteStream(null);
  }, [setLocalStream, setRemoteStream, setPeerConnection]);

  // Send chat message via data channel
  const sendDataMessage = useCallback((message) => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify({
        type: 'chat',
        senderId: user?.id,
        username: user?.username,
        message,
        timestamp: new Date().toISOString()
      }));
    } else {
      console.warn('Data channel not open');
    }
  }, [user]);

  // Set up signal handler
  useEffect(() => {
    setWebRTCSignalHandler(handleWebRTCSignal);
    
    return () => {
      setWebRTCSignalHandler(null);
    };
  }, [setWebRTCSignalHandler, handleWebRTCSignal]);

  return {
    setupPeerConnection,
    cleanup,
    sendDataMessage,
    isDataChannelOpen: dataChannelRef.current?.readyState === 'open'
  };
};

export default useWebRTC;