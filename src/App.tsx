import { useState, useEffect } from "react";
import {
  LogIn,
  Cloud,
  WifiOff,
  User,
  Settings as SettingsIcon,
  Menu,
  X,
  BrainCircuit,
  VolumeX,
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
    chats,
    activeChatId,
    setActiveChatId,
    messages,
    allMessages,
    searchQuery,
    setSearchQuery,
    loading,
    inputText,
    setInputText,
    createNewSession,
    deleteSession,
    sendMessageToBot,
    migrateLocalDataToCloud,
    devScrollRef,
  } = useChatManager({
    currentUser,
    authLoading,
    persona,
    onBotReply: (replyText, msgId) => {
      if (autoReadReplies && voiceSpeechEnabled) {
        speakTextOutLoud(replyText, msgId);
      } else if (handsFreeMode) {
        startVoiceCapture();
      }
    },
  });

  // 5. Sync offline chats to Firestore upon login
  useEffect(() => {
    if (currentUser) {
      migrateLocalDataToCloud(currentUser.uid);
    }
  }, [currentUser, migrateLocalDataToCloud]);

  // Layout presentation controls
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [activeSettings, setActiveSettings] = useState<boolean>(false);
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
    <div className="min-h-screen bg-black text-zinc-100 font-sans flex overflow-hidden w-full relative">
      {/* Left Sidebar Panel (Responsive layout) */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {/* Dark blur backdrop for mobile views */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (window.innerWidth < 1024) {
                  setSidebarOpen(false);
                }
              }}
              className="fixed inset-0 bg-black/80 backdrop-blur-xs z-40 lg:hidden"
            />

            {/* Sidebar content container */}
            <motion.div
              initial={{ x: -320, opacity: 0.5 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0.5 }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed top-0 bottom-0 left-0 w-[300px] bg-zinc-950 border-r border-red-950/30 p-5 flex flex-col justify-between z-50 lg:static lg:h-screen lg:w-[320px] lg:flex-shrink-0"
            >
              <div className="flex flex-col gap-3 min-h-0 flex-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/20">
                      <BrainCircuit className="text-white w-5 h-5 font-bold" />
                    </div>
                    <div>
                      <h1 className="text-sm font-bold tracking-tight text-white font-sans">
                        Talker AI
                      </h1>
                      <span className="text-[9px] text-red-500 font-mono tracking-wider block leading-none">
                        Your Personal AI Assistant
                      </span>
                    </div>
                  </div>

                  {/* Drawer toggle for mobile */}
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-1 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-zinc-300 lg:hidden cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

<p className="text-[11px] text-zinc-400 leading-normal mb-1">
  A private AI assistant powered by Ollama with conversation memory, Markdown support, and intelligent assistance for coding, writing, learning, and everyday tasks.
</p>

                {/* Session lists and filters */}
                <ChatSessionsStrip
                  chats={chats}
                  activeChatId={activeChatId}
                  onSelectChat={(id) => {
                    setActiveChatId(id);
                    if (window.innerWidth < 1024) {
                      setSidebarOpen(false);
                    }
                  }}
                  allMessages={allMessages}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  onCreateSession={createNewSession}
                  onDeleteSession={deleteSession}
                />
              </div>

              {/* Sidebar bottom block: User profile and triggers */}
              <div className="border-t border-zinc-900 pt-4 mt-auto flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  {currentUser ? (
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {currentUser.photoURL ? (
                        <img
                          src={currentUser.photoURL}
                          className="w-6 h-6 rounded-full flex-shrink-0"
                          alt="avatar"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center flex-shrink-0">
                          <User className="w-3.5 h-3.5 text-zinc-400" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="text-xs text-zinc-200 font-medium block truncate">
                          {currentUser.displayName || currentUser.email}
                        </span>
                        <button
                          onClick={logoutOfApp}
                          className="text-red-500 hover:text-red-400 text-[10px] font-sans font-medium transition cursor-pointer"
                        >
                          Sign Out
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={loginWithGoogle}
                      className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-2 px-3 rounded-xl flex items-center gap-1.5 shadow cursor-pointer transition w-full justify-center"
                    >
                      <LogIn className="w-4 h-4" /> Sync with Google
                    </button>
                  )}

                  {/* Settings popup trigger */}
                  <button
                    onClick={() => setActiveSettings(!activeSettings)}
                    className={`p-2 rounded-xl transition border flex-shrink-0 cursor-pointer ${
                      activeSettings
                        ? "bg-red-600 text-white border-red-500"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                    }`}
                    title="Voice and sync configurations"
                  >
                    <SettingsIcon className="w-4.5 h-4.5" />
                  </button>
                </div>

                {/* Cloud sync indicator */}
                <div className="flex items-center justify-between text-[10px] text-zinc-500 bg-zinc-950 border border-zinc-900 px-2.5 py-1.5 rounded-xl font-mono">
                  <span className="flex items-center gap-1">
                    <Cloud className="w-3.5 h-3.5 text-zinc-600" /> Cloud Sync
                  </span>
                  <span
                    className={`font-bold flex items-center gap-1 ${
                      isOnline ? "text-red-500" : "text-amber-500"
                    }`}
                  >
                    <span
                      className={`w-1 h-1 rounded-full ${
                        isOnline ? "bg-red-500 animate-pulse" : "bg-amber-400"
                      }`}
                    />
                    {isOnline ? "ONLINE" : "OFFLINE CACHE"}
                  </span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col h-screen bg-black overflow-hidden relative">
        {/* Offline Notification Banner */}
        <AnimatePresence>
          {!isOnline && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-red-600 text-white text-xs px-4 py-2.5 flex items-center justify-between font-medium z-30 shadow"
            >
              <div className="flex items-center gap-2 mx-auto">
                <WifiOff className="w-4 h-4" />
                <span>
                  Offline local fallback mode active. Maps polylines and grounding searches will auto-resume upon connection recovery!
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Header Bar */}
        <header className="h-16 border-b border-zinc-900 bg-zinc-950 px-6 flex items-center justify-between z-10 flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Toggle sidebar panel */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 cursor-pointer transition"
              title={sidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
            >
              <Menu className="w-5 h-5" />
            </button>

            <div>
              <h2 className="text-sm font-bold text-white capitalize flex items-center gap-1.5 leading-none font-sans">
                Talker AI Assistant
              </h2>
              <span className="text-[10px] text-zinc-500 font-mono tracking-wide">
                {activeChatId ? "PERSISTENT SESSION ACTIVE" : "NO CONVERSATION SELECTED"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] text-zinc-500 hidden sm:inline-block font-mono font-bold uppercase tracking-wider bg-zinc-900 px-2 py-1 rounded border border-zinc-850">
              English Only ✦ Active Context Memory
            </span>

            {/* Floating configuration trigger */}
            {!sidebarOpen && (
              <button
                onClick={() => setActiveSettings(!activeSettings)}
                className={`p-2 rounded-lg transition border cursor-pointer ${
                  activeSettings
                    ? "bg-red-950/40 border-red-500 text-red-400"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
                title="Voice and sync configurations"
              >
                <SettingsIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        {/* Dynamic chat interface body viewport */}
        <main className="flex-1 p-4 md:p-6 overflow-hidden bg-black flex flex-col max-w-5xl mx-auto w-full justify-between">
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
