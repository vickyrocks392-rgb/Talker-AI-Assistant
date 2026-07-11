import { useState, useEffect } from "react";
import {
  LogIn,
  WifiOff,
  User,
  Settings as SettingsIcon,
  Menu,
  X,
  BrainCircuit,
  VolumeX,
  Plus,
  Search,
  MessageSquare,
  BookOpen,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
// @ts-nocheck

// Import custom React hooks
import { useAuthAndProfile } from "./hooks/useAuthAndProfile";
import { useChatManager } from "./hooks/useChatManager";
import { useVoiceAssistant } from "./hooks/useVoiceAssistant";

// Import modular components
import { VoiceSettings } from "./components/VoiceSettings";
import { ChatSessionsStrip } from "./components/ChatSessionsStrip";
import { ChatViewport } from "./components/ChatViewport";
import { LockScreen } from "./components/LockScreen";
import { KnowledgeCenter } from "./components/KnowledgeCenter";

export default function App() {
  // 1. Browser Network State
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // 2. Auth, Profile & Security states hook
  const {
    currentUser,
    authLoading,
    persona,
    securityConfig,
    isAppLocked,
    setIsAppLocked,
    savePersona,
    saveSecurity,
    loginWithGoogle,
    logoutOfApp,
  } = useAuthAndProfile();

  // 3. Voice capture & Speech services hook
  const {
    selectedVoiceId,
    setSelectedVoiceId,
    voiceType,
    setVoiceType,
    voiceSpeechEnabled,
    setVoiceSpeechEnabled,
    handsFreeMode,
    speakingMessageId,
    isListening,
    speechError,
    setSpeechError,
    geminiQuotaExceeded,
    startVoiceCapture,
    stopVoiceCapture,
    toggleHandsFree,
    speakTextOutLoud,
    stopActiveSpeech,
  } = useVoiceAssistant({
    onSpeechResult: (text) => sendMessageToBot(text),
    isOnline,
  });

  // 3a. Global voice preference: auto-read AI replies (default OFF)
  const [autoReadReplies, setAutoReadReplies] = useState<boolean>(() => {
    const stored = localStorage.getItem("talker_auto_read_replies");
    return stored === "true";
  });

  useEffect(() => {
    localStorage.setItem("talker_auto_read_replies", String(autoReadReplies));
  }, [autoReadReplies]);

  // 4. Chat session list, syncing, and messages pipelines hook
  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    messages,
    loading,
    inputText,
    setInputText,
    createNewSession,
    deleteSession,
    sendMessageToBot,
    devScrollRef,
  } = useChatManager({
    persona,
    onBotReply: (replyText, msgId) => {
      if (autoReadReplies && voiceSpeechEnabled) {
        speakTextOutLoud(replyText, msgId);
      } else if (handsFreeMode) {
        startVoiceCapture();
      }
    },
  });

  // Layout presentation controls
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [activeSettings, setActiveSettings] = useState<boolean>(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Auto-open sidebar on desktop sized devices
  useEffect(() => {
    if (window.innerWidth >= 1024) {
      setSidebarOpen(true);
    }
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Insert Document Summary Into Chat handler
  useEffect(() => {
    const handleInsertSummary = (event: CustomEvent) => {
      const doc = event.detail?.document;
      if (doc) {
        const summaryText = `I have uploaded "${doc.filename}" and would like to discuss its contents.`;
        setInputText(summaryText);
      }
    };

    window.addEventListener('insert-document-summary', handleInsertSummary as EventListener);
    return () => {
      window.removeEventListener('insert-document-summary', handleInsertSummary as EventListener);
    };
  }, []);

  // Safe lock-screen guard
  if (isAppLocked && securityConfig.securityEnabled) {
    return (
      <LockScreen
        pin={securityConfig.pin}
        voicePassphrase={securityConfig.voicePassphrase}
        firstName={securityConfig.firstName}
        onUnlock={() => setIsAppLocked(false)}
        selectedVoiceId={selectedVoiceId}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-gray-900 font-sans flex overflow-hidden w-full relative">
      {/* Left Sidebar Panel (Responsive layout) */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {/* Backdrop for mobile views */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (window.innerWidth < 1024) {
                  setSidebarOpen(false);
                }
              }}
              className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-40 lg:hidden"
            />

            {/* Sidebar content container */}
            <motion.div
              initial={{ x: -320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed top-0 bottom-0 left-0 w-[300px] bg-white border-r border-gray-200 p-5 flex flex-col justify-between z-50 lg:static lg:h-screen lg:w-[320px] lg:flex-shrink-0 shadow-xl"
            >
              <div className="flex flex-col gap-4 min-h-0 flex-1">
                {/* Logo and Product Name - Improved branding */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center shadow-sm">
                      <BrainCircuit className="text-white w-6 h-6" />
                    </div>
                    <div>
                      <h1 className="text-lg font-bold tracking-tight text-gray-900">
                        Talker AI
                      </h1>
                      <span className="text-xs text-gray-500 font-medium tracking-wide block leading-tight">
                        Intelligent AI Workspace
                      </span>
                    </div>
                  </div>

                  {/* Drawer toggle for mobile */}
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 lg:hidden cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* New Chat Button */}
                <button
                  onClick={createNewSession}
                  className="w-full bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm hover:shadow transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  New Chat
                </button>

                {/* Knowledge Center Toggle */}
                <button
                  onClick={() => setKnowledgeOpen(!knowledgeOpen)}
                  className={`w-full flex items-center justify-center gap-2 text-sm font-semibold py-2.5 px-4 rounded-xl transition cursor-pointer ${
                    knowledgeOpen
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  Knowledge Center
                </button>

                {/* Session lists and filters */}
                <ChatSessionsStrip
                  conversations={conversations}
                  activeConversationId={activeConversationId}
                  onSelectChat={(id) => {
                    setActiveConversationId(id);
                    if (window.innerWidth < 1024) {
                      setSidebarOpen(false);
                    }
                  }}
                  messages={messages}
                  onCreateSession={createNewSession}
                  onDeleteSession={deleteSession}
                  loading={loading}
                />
              </div>

              {/* Sidebar bottom block: User profile and settings */}
              <div className="border-t border-gray-200 pt-4 mt-auto flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  {currentUser ? (
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {currentUser.photoURL ? (
                        <img
                          src={currentUser.photoURL}
                          className="w-8 h-8 rounded-full flex-shrink-0"
                          alt="avatar"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-gray-600" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-gray-900 font-medium block truncate">
                          {currentUser.displayName || currentUser.email}
                        </span>
                        <button
                          onClick={logoutOfApp}
                          className="text-red-600 hover:text-red-700 text-xs font-medium transition cursor-pointer"
                        >
                          Sign Out
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={loginWithGoogle}
                      className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 text-sm font-semibold py-2 px-4 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer w-full"
                    >
                      <LogIn className="w-4 h-4" />
                      Sign In
                    </button>
                  )}

                  {/* Settings popup trigger */}
                  <button
                    onClick={() => setActiveSettings(!activeSettings)}
                    className={`p-2 rounded-xl transition border flex-shrink-0 cursor-pointer ${
                      activeSettings
                        ? "bg-red-50 border-red-200 text-red-600"
                        : "bg-white border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    }`}
                    title="Settings"
                  >
                    <SettingsIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Knowledge Center Panel (collapsible width animation) */}
      {/* Backdrop for mobile */}
      <AnimatePresence>
        {knowledgeOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (window.innerWidth < 1024) {
                setKnowledgeOpen(false);
              }
            }}
            className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Knowledge Center Panel */}
      <motion.div
        animate={{ 
          width: knowledgeOpen ? 340 : 0,
          opacity: knowledgeOpen ? 1 : 0,
        }}
        transition={{ 
          duration: 0.3,
          ease: [0.4, 0, 0.2, 1],
        }}
        className="overflow-hidden flex-shrink-0 bg-white border-l border-gray-200 shadow-xl"
        style={{ minWidth: 0 }}
      >
        <div className="h-screen overflow-hidden">
          {knowledgeOpen && (
            <div className="w-[340px] h-full">
              <KnowledgeCenter onClose={() => setKnowledgeOpen(false)} />
            </div>
          )}
        </div>
      </motion.div>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col h-screen bg-[#fafafa] overflow-hidden relative">
        {/* Offline Notification Banner */}
        <AnimatePresence>
          {!isOnline && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm px-4 py-2.5 flex items-center justify-between font-medium z-30"
            >
              <div className="flex items-center gap-2 mx-auto">
                <WifiOff className="w-4 h-4" />
                <span>
                  You're currently offline. Some features may be limited.
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Header Bar - Improved with meaningful metadata */}
        <header className="h-16 border-b border-gray-200 bg-white px-4 md:px-6 flex items-center justify-between z-10 flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Toggle sidebar panel */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-900 cursor-pointer transition"
              title={sidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
            >
              <Menu className="w-5 h-5" />
            </button>

            <div>
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 leading-none">
                {activeConversationId ? "Conversation" : "Talker AI"}
              </h2>
              {activeConversationId && (
                <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-0.5">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Memory Enabled
                  </span>
                  <span className="text-gray-300">•</span>
                  <span>Knowledge Connected</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Knowledge Center toggle for mobile */}
            {!knowledgeOpen && (
              <button
                onClick={() => setKnowledgeOpen(true)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-900 cursor-pointer transition lg:hidden"
                title="Knowledge Center"
              >
                <BookOpen className="w-4 h-4" />
              </button>
            )}
            
            {/* Floating configuration trigger */}
            {!sidebarOpen && (
              <button
                onClick={() => setActiveSettings(!activeSettings)}
                className={`p-2 rounded-lg transition border cursor-pointer ${
                  activeSettings
                    ? "bg-red-50 border-red-200 text-red-600"
                    : "bg-white border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
                title="Settings"
              >
                <SettingsIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        {/* Dynamic chat interface body viewport */}
        <main className="flex-1 overflow-hidden bg-[#fafafa] flex flex-col">
          <ChatViewport
            messages={messages}
            loading={loading}
            speechError={speechError}
            onClearSpeechError={() => setSpeechError(null)}
            handsFreeMode={handsFreeMode}
            onToggleHandsFree={toggleHandsFree}
            inputText={inputText}
            onInputTextChange={setInputText}
            isListening={isListening}
            onStartVoiceCapture={startVoiceCapture}
            onStopVoiceCapture={stopVoiceCapture}
            onSendMessage={sendMessageToBot}
            speakingMessageId={speakingMessageId}
            copiedId={copiedId}
            onSpeak={speakTextOutLoud}
            onCopy={copyToClipboard}
            devScrollRef={devScrollRef}
          />
        </main>

        {/* Global overlay settings modal */}
        <AnimatePresence>
          {activeSettings && (
            <VoiceSettings
              onClose={() => setActiveSettings(false)}
              selectedVoiceId={selectedVoiceId}
              onSelectVoiceId={setSelectedVoiceId}
              voiceType={voiceType}
              onSelectVoiceType={setVoiceType}
              geminiQuotaExceeded={geminiQuotaExceeded}
              voiceSpeechEnabled={voiceSpeechEnabled}
              onToggleVoiceSpeech={setVoiceSpeechEnabled}
              autoReadReplies={autoReadReplies}
              onToggleAutoReadReplies={setAutoReadReplies}
              currentUser={currentUser}
              onLogin={loginWithGoogle}
              onLogout={logoutOfApp}
              isOnline={isOnline}
              persona={persona}
              onSavePersona={savePersona}
              securityEnabled={securityConfig.securityEnabled}
              pin={securityConfig.pin}
              voicePassphrase={securityConfig.voicePassphrase}
              firstName={securityConfig.firstName}
              onSaveSecurity={saveSecurity}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}