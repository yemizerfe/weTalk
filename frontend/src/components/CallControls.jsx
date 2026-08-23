import { useState } from 'react';
import { Phone, Video, ChevronUp, ChevronDown } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';

const CallControls = () => {
  const { activeConversation, initiateCall } = useChatStore();
  const { user } = useAuthStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [callType, setCallType] = useState('audio'); // 'audio' or 'video'

  if (!activeConversation) return null;

  const otherUser = activeConversation.otherUser || (
    activeConversation.user1Id === user.id
      ? activeConversation.user2
      : activeConversation.user1
  );

  const handleCallInitiate = async (type) => {
    if (!activeConversation) return;
    if (!otherUser || String(otherUser.id) === String(user?.id)) return;

    setCallType(type);
    initiateCall(activeConversation.id, type);
    
    // Collapse after initiating
    setIsExpanded(false);
  };

  return (
    <div className="relative">
      {/* Collapsed State */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="fixed bottom-24 right-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-full p-4 shadow-2xl transition-all duration-300 transform hover:scale-105 active:scale-95 z-40"
        >
          <Phone className="w-6 h-6" />
        </button>
      )}

      {/* Expanded State */}
      {isExpanded && (
        <div className="fixed bottom-6 right-6 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 z-40 min-w-[320px]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Start a Call
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                with {otherUser?.username || 'User'}
              </p>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <ChevronDown className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* User Preview */}
          <div className="flex items-center space-x-4 mb-8 p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
              {otherUser?.avatar ? (
                <img
                  src={otherUser.avatar}
                  alt={otherUser.username}
                  className="w-14 h-14 rounded-full object-cover"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                  <span className="text-white font-bold text-xl">
                    {otherUser?.username?.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white">
                {otherUser?.username || 'Unknown User'}
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {activeConversation.lastMessage
                  ? `Last active: ${new Date(activeConversation.updatedAt).toLocaleDateString()}`
                  : 'Ready to connect'}
              </p>
            </div>
          </div>

          {/* Call Type Selection */}
          <div className="mb-8">
            <div className="flex space-x-4 mb-4">
              <button
                onClick={() => setCallType('audio')}
                className={`flex-1 py-4 px-6 rounded-xl transition-all duration-200 ${
                  callType === 'audio'
                    ? 'bg-blue-100 dark:bg-blue-900 border-2 border-blue-500'
                    : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <div className="flex flex-col items-center">
                  <Phone className={`w-8 h-8 mb-2 ${
                    callType === 'audio' 
                      ? 'text-blue-600 dark:text-blue-400' 
                      : 'text-gray-500'
                  }`} />
                  <span className={`font-medium ${
                    callType === 'audio'
                      ? 'text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    Voice Call
                  </span>
                  <span className="text-sm text-gray-500 mt-1">
                    Audio only
                  </span>
                </div>
              </button>

              <button
                onClick={() => setCallType('video')}
                className={`flex-1 py-4 px-6 rounded-xl transition-all duration-200 ${
                  callType === 'video'
                    ? 'bg-red-100 dark:bg-red-900 border-2 border-red-500'
                    : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <div className="flex flex-col items-center">
                  <Video className={`w-8 h-8 mb-2 ${
                    callType === 'video'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-500'
                  }`} />
                  <span className={`font-medium ${
                    callType === 'video'
                      ? 'text-red-700 dark:text-red-300'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    Video Call
                  </span>
                  <span className="text-sm text-gray-500 mt-1">
                    Audio + Video
                  </span>
                </div>
              </button>
            </div>

            <div className="text-sm text-gray-600 dark:text-gray-400 px-2">
              {callType === 'audio' ? (
                <p>Start a voice call with {otherUser?.username}. Both of you need to be online.</p>
              ) : (
                <p>Start a video call with {otherUser?.username}. Make sure you have camera permissions.</p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-4">
            <button
              onClick={() => setIsExpanded(false)}
              className="flex-1 py-3 px-6 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-xl font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => handleCallInitiate(callType)}
              className={`flex-1 py-3 px-6 rounded-xl font-medium text-white transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] ${
                callType === 'audio'
                  ? 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600'
                  : 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600'
              }`}
            >
              {callType === 'audio' ? (
                <div className="flex items-center justify-center space-x-2">
                  <Phone className="w-5 h-5" />
                  <span>Start Voice Call</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <Video className="w-5 h-5" />
                  <span>Start Video Call</span>
                </div>
              )}
            </button>
          </div>

          {/* Additional Info */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-2">
              <p>• Calls are end-to-end encrypted</p>
              <p>• Call quality depends on your internet connection</p>
              <p>• You can switch between audio and video during the call</p>
            </div>
          </div>
        </div>
      )}

      {/* Backdrop for expanded state */}
      {isExpanded && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-30 z-30"
          onClick={() => setIsExpanded(false)}
        />
      )}
    </div>
  );
};

export default CallControls;