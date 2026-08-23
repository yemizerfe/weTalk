import { useEffect, useState } from 'react';
import { Phone, PhoneOff, User } from 'lucide-react';
import { useChatStore } from '../store/chatStore';

const IncomingCall = () => {
  const { incomingCall, acceptCall, rejectCall } = useChatStore();
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    setIsVisible(Boolean(incomingCall));
  }, [incomingCall?.callId]);

  useEffect(() => {
    if (!incomingCall || !isVisible) return undefined;

    let ringtone;
    let audioContext;
    try {
      audioContext = new AudioContext();
      audioContext.resume().catch(() => {});
      ringtone = window.setInterval(() => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.frequency.value = 880;
        oscillator.type = 'sine';
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.35);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.35);
      }, 900);
    } catch (error) {
      console.warn('Unable to play incoming call ringtone:', error);
    }

    return () => {
      if (ringtone) window.clearInterval(ringtone);
      audioContext?.close();
    };
  }, [incomingCall, isVisible]);

  if (!incomingCall || !isVisible) return null;

  const { caller, callType } = incomingCall;
  const isVideoCall = callType === 'video';

  const handleAccept = () => {
    acceptCall();
    setIsVisible(false);
  };

  const handleReject = () => {
    rejectCall();
    setIsVisible(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-center">
          {/* Caller Info */}
          <div className="mb-6">
            <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              {caller.avatar ? (
                <img
                  src={caller.avatar}
                  alt={caller.username}
                  className="w-20 h-20 rounded-full object-cover"
                />
              ) : (
                <User className="w-12 h-12 text-white" />
              )}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {caller.username}
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              {isVideoCall ? 'Video Call' : 'Voice Call'}
            </p>
          </div>

          {/* Call Type Badge */}
          <div className="mb-6">
            <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
              isVideoCall 
                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' 
                : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
            }`}>
              {isVideoCall ? '📹 Video Call' : '📞 Voice Call'}
            </span>
          </div>

          {/* Call Duration (if any) */}
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-8">
            Incoming call...
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center space-x-6">
            {/* Reject Button */}
            <button
              onClick={handleReject}
              className="flex flex-col items-center justify-center w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all duration-200 transform hover:scale-105 active:scale-95"
            >
              <PhoneOff className="w-8 h-8 mb-1" />
              <span className="text-sm font-medium">Decline</span>
            </button>

            {/* Accept Button */}
            <button
              onClick={handleAccept}
              className={`flex flex-col items-center justify-center w-20 h-20 rounded-full transition-all duration-200 transform hover:scale-105 active:scale-95 ${
                isVideoCall
                  ? 'bg-green-500 hover:bg-green-600'
                  : 'bg-green-500 hover:bg-green-600'
              } text-white`}
            >
              <Phone className="w-8 h-8 mb-1" />
              <span className="text-sm font-medium">
                {isVideoCall ? 'Video' : 'Answer'}
              </span>
            </button>
          </div>

          {/* Additional Info */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              This call will be recorded in your conversation history
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IncomingCall;