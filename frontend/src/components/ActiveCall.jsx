import { useState, useEffect, useRef } from 'react';
import { PhoneOff, Mic, MicOff, Video, VideoOff, Settings, Users, Volume2 } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';

const ActiveCall = () => {
  const {
    activeCall,
    activeConversation,
    callStatus,
    localStream,
    remoteStream,
    isMuted,
    isVideoEnabled,
    endCall,
    toggleMute,
    toggleVideo,
    setLocalStream,
    setRemoteStream
  } = useChatStore();
  
  const { user } = useAuthStore();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const [callDuration, setCallDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [participants, setParticipants] = useState([]);

  useEffect(() => {
    if (!activeCall || !['ringing', 'in-progress'].includes(callStatus)) return;

    // Update call duration every second
    const durationInterval = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    // Auto-hide controls after 3 seconds of inactivity
    const hideControlsTimeout = setTimeout(() => {
      setShowControls(false);
    }, 3000);

    return () => {
      clearInterval(durationInterval);
      clearTimeout(hideControlsTimeout);
    };
  }, [activeCall, callStatus]);

  useEffect(() => {
    // Setup video elements when streams are available
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }

    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }

    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [localStream, remoteStream]);

  useEffect(() => {
    // Mock participants (in real app, this would come from backend)
    if (activeCall) {
      const otherUser = activeCall.caller?.id === user.id
        ? activeConversation?.otherUser
        : activeCall.caller;
      setParticipants([
        { id: user.id, username: user.username, avatar: user.avatar, isSelf: true },
        ...(otherUser ? [{ id: otherUser.id, username: otherUser.username, avatar: otherUser.avatar, isSelf: false }] : [])
      ]);
    }
  }, [activeCall, user]);

  if (!activeCall || !['ringing', 'in-progress'].includes(callStatus)) return null;

  const { callType } = activeCall;
  const isVideoCall = callType === 'video';

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMouseMove = () => {
    setShowControls(true);
  };

  const handleEndCall = () => {
    endCall();
  };

  const handleToggleMute = () => {
    toggleMute();
  };

  const handleToggleVideo = () => {
    toggleVideo();
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-gray-900"
      onMouseMove={handleMouseMove}
      onTouchStart={handleMouseMove}
    >
      {/* Video Containers */}
      <div className="relative w-full h-full">
        {/* Remote Video (Main) */}
        {isVideoCall && remoteStream ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
            muted={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
            <div className="text-center">
              <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        {(activeCall.caller || activeConversation?.otherUser)?.avatar ? (
                          <img
                            src={(activeCall.caller || activeConversation.otherUser).avatar}
                            alt={(activeCall.caller || activeConversation.otherUser).username}
                    className="w-28 h-28 rounded-full object-cover"
                  />
                ) : (
                  <Users className="w-16 h-16 text-white" />
                )}
              </div>
              <h2 className="text-3xl font-bold text-white mb-2">
                {(activeCall.caller || activeConversation?.otherUser)?.username || 'Call'}
              </h2>
              <p className="text-gray-300">Voice Call</p>
            </div>
          </div>
        )}

        {!isVideoCall && <audio ref={remoteAudioRef} autoPlay playsInline />}

        {/* Local Video (Picture-in-Picture) */}
        {isVideoCall && localStream && (
          <div className="absolute bottom-24 right-6 w-48 h-36 rounded-xl overflow-hidden border-4 border-white shadow-2xl">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {!isVideoEnabled && (
              <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                <VideoOff className="w-12 h-12 text-gray-400" />
              </div>
            )}
          </div>
        )}

        {/* Call Info Overlay */}
        <div className="absolute top-6 left-6 right-6 flex justify-between items-start">
          <div className="bg-black bg-opacity-50 rounded-xl px-4 py-3 backdrop-blur-sm">
            <h3 className="text-white font-semibold text-lg">
              {(activeCall.caller || activeConversation?.otherUser)?.username || 'Call'}
            </h3>
            <p className="text-gray-300 text-sm">
              {callStatus === 'ringing' ? 'Calling...' : `${formatDuration(callDuration)} • ${isVideoCall ? 'Video Call' : 'Voice Call'}`}
            </p>
          </div>

          {/* Participants Count */}
          <div className="bg-black bg-opacity-50 rounded-xl px-4 py-3 backdrop-blur-sm">
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5 text-white" />
              <span className="text-white font-medium">
                {participants.length} participant{participants.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Controls */}
        {showControls && (
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2">
            <div className="bg-black bg-opacity-70 rounded-full px-8 py-4 backdrop-blur-lg flex items-center space-x-8">
              {/* Mute Toggle */}
              <button
                onClick={handleToggleMute}
                className={`flex flex-col items-center justify-center w-16 h-16 rounded-full transition-all duration-200 ${
                  isMuted
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-gray-700 hover:bg-gray-600'
                } text-white`}
              >
                {isMuted ? (
                  <MicOff className="w-7 h-7" />
                ) : (
                  <Mic className="w-7 h-7" />
                )}
                <span className="text-xs mt-1">
                  {isMuted ? 'Unmute' : 'Mute'}
                </span>
              </button>

              {/* Video Toggle (only for video calls) */}
              {isVideoCall && (
                <button
                  onClick={handleToggleVideo}
                  className={`flex flex-col items-center justify-center w-16 h-16 rounded-full transition-all duration-200 ${
                    isVideoEnabled
                      ? 'bg-gray-700 hover:bg-gray-600'
                      : 'bg-red-500 hover:bg-red-600'
                  } text-white`}
                >
                  {isVideoEnabled ? (
                    <Video className="w-7 h-7" />
                  ) : (
                    <VideoOff className="w-7 h-7" />
                  )}
                  <span className="text-xs mt-1">
                    {isVideoEnabled ? 'Video Off' : 'Video On'}
                  </span>
                </button>
              )}

              {/* Volume Control */}
              <button className="flex flex-col items-center justify-center w-16 h-16 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-all duration-200">
                <Volume2 className="w-7 h-7" />
                <span className="text-xs mt-1">Volume</span>
              </button>

              {/* Settings */}
              <button className="flex flex-col items-center justify-center w-16 h-16 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-all duration-200">
                <Settings className="w-7 h-7" />
                <span className="text-xs mt-1">Settings</span>
              </button>

              {/* End Call */}
              <button
                onClick={handleEndCall}
                className="flex flex-col items-center justify-center w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 text-white transition-all duration-200 transform hover:scale-105"
              >
                <PhoneOff className="w-7 h-7" />
                <span className="text-xs mt-1">End</span>
              </button>
            </div>
          </div>
        )}

        {/* Participants List */}
        {participants.length > 0 && (
          <div className="absolute bottom-24 left-6 bg-black bg-opacity-70 rounded-xl p-4 backdrop-blur-lg max-w-xs">
            <h4 className="text-white font-semibold mb-3">Participants</h4>
            <div className="space-y-3">
              {participants.map(participant => (
                <div key={participant.id} className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                    {participant.avatar ? (
                      <img
                        src={participant.avatar}
                        alt={participant.username}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <Users className="w-5 h-5 text-white" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium">
                      {participant.username}
                      {participant.isSelf && ' (You)'}
                    </p>
                    <p className="text-gray-300 text-sm">
                      {participant.isSelf 
                        ? (isMuted ? 'Muted' : 'Speaking') 
                        : 'Connected'}
                    </p>
                  </div>
                  {participant.isSelf && isMuted && (
                    <MicOff className="w-4 h-4 text-red-400" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActiveCall;