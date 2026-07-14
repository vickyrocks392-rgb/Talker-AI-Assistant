import { useState, useEffect, useCallback, useRef } from "react";
import {
  WifiOff,
  Settings as SettingsIcon,
  Menu,
  X,
  BrainCircuit,
  Plus,
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
import { WorkspaceIntelligenceSidebar } from "./components/WorkspaceIntelligenceSidebar";

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

  // Prevent browser scroll on mount
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
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
    aiMonitorData,
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

  // ── DEBUG: Log aiMonitorData from hook ─────────────────────────────
  console.log("[AI Monitor DEBUG] App.tsx aiMonitorData:", aiMonitorData);

  // Layout presentation controls
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [activeSettings, setActiveSettings] = useState<boolean>(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Workspace Intelligence Sidebar state with persistence
  const [workspaceIntelligenceOpen, setWorkspaceIntelligenceOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem("workspace_intelligence_open");
    return stored === "true";
  });
  
  // Draggable button position state
  const [buttonY, setButtonY] = useState<number>(() => {
    const stored = localStorage.getItem("workspace_intelligence_button_y");
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
    return window.innerHeight / 2; // Default to middle of viewport
  });
  
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const buttonStartYRef = useRef(0);
  const hasDraggedRef = useRef(false);
  
  // Persist button position to localStorage
  useEffect(() => {
    localStorage.setItem("workspace_intelligence_button_y", String(buttonY));
  }, [buttonY]);
  
  // Drag handlers for the button
  const handleButtonMouseDown = useCallback((e: any) => {
    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    dragStartYRef.current = e.clientY;
    buttonStartYRef.current = buttonY;
    e.preventDefault();
  }, [buttonY]);
  
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      
      const deltaY = e.clientY - dragStartYRef.current;
      const totalDistance = Math.abs(deltaY);
      
      // Mark as dragged if movement >= 5px
      if (totalDistance >= 5) {
        hasDraggedRef.current = true;
      }
      
      const buttonHeight = 80; // Approximate button height
      const newY = buttonStartYRef.current + deltaY;
      
      // Constrain to viewport
      const constrainedY = Math.max(buttonHeight / 2, Math.min(window.innerHeight - buttonHeight / 2, newY));
      setButtonY(constrainedY);
    };
    
    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);
  
  // Click handler that respects drag distance
  const handleButtonClick = useCallback(() => {
    // Only open sidebar if we didn't drag
    if (!hasDraggedRef.current) {
      setWorkspaceIntelligenceOpen(true);
    }
    // Reset drag flag
    hasDraggedRef.current = false;
  }, []);
  
  // Track if auto-expansion has been triggered for each event category (with localStorage persistence)
  const autoExpandTrackerRef = useRef<Set<string>>(new Set());
  
  // Initialize tracker from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("workspace_intelligence_autoexpand_tracker");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as string[];
        autoExpandTrackerRef.current = new Set(parsed);
      } catch (e) {
        // Invalid data, start fresh
        autoExpandTrackerRef.current = new Set();
      }
    }
  }, []);
  
  // Persist tracker to localStorage whenever it changes
  useEffect(() => {
    const toStore = Array.from(autoExpandTrackerRef.current);
    localStorage.setItem("workspace_intelligence_autoexpand_tracker", JSON.stringify(toStore));
  }, [autoExpandTrackerRef.current]);

  // First-run experience / onboarding state
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    const dismissed = localStorage.getItem("talker_onboarding_dismissed");
    return dismissed !== "true";
  });

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false);
    localStorage.setItem("talker_onboarding_dismissed", "true");
  }, []);

  // Auto-dismiss onboarding when first conversation is created
  useEffect(() => {
    if (conversations.length > 0 && showOnboarding) {
      setShowOnboarding(false);
      localStorage.setItem("talker_onboarding_dismissed", "true");
    }
  }, [conversations.length, showOnboarding]);

  // Auto-open sidebar on desktop sized devices
  useEffect(() => {
    if (window.innerWidth >= 1024) {
      setSidebarOpen(true);
    }
  }, []);

  // Persist workspace intelligence sidebar state
  useEffect(() => {
    console.log(`[AutoExpand] workspaceIntelligenceOpen state changed to: ${workspaceIntelligenceOpen}`);
    localStorage.setItem("workspace_intelligence_open", String(workspaceIntelligenceOpen));
  }, [workspaceIntelligenceOpen]);

  // Intelligent auto-expansion for important events
  const triggerAutoExpand = useCallback((eventCategory: string) => {
    console.log(`[AutoExpand] triggerAutoExpand(${eventCategory})`);
    
    const STORAGE_KEYS: Record<string, string> = {
      'document_upload': 'workspace_intelligence_autoexpand_documents',
      'memory_retrieval': 'workspace_intelligence_autoexpand_memory',
      'rag_retrieval': 'workspace_intelligence_autoexpand_rag',
      'tool_execution': 'workspace_intelligence_autoexpand_tools',
      'system_degraded': 'workspace_intelligence_autoexpand_health',
    };
    
    const storageKey = STORAGE_KEYS[eventCategory];
    if (!storageKey) {
      console.log(`[AutoExpand] No storage key for ${eventCategory}, returning`);
      return;
    }
    
    // Check localStorage for cooldown timestamp
    const lastTriggered = localStorage.getItem(storageKey);
    const now = Date.now();
    
    if (lastTriggered) {
      const cooldownMs = 5 * 60 * 1000; // 5 minutes
      const timeSinceTrigger = now - parseInt(lastTriggered, 10);
      
      console.log(`[AutoExpand] cooldown check:`, {
        lastExpand: lastTriggered ? new Date(parseInt(lastTriggered, 10)).toISOString() : 'never',
        now: new Date(now).toISOString(),
        timeSinceTrigger: `${(timeSinceTrigger / 1000).toFixed(1)}s`,
        cooldown: `${(cooldownMs / 1000).toFixed(1)}s`,
        allowed: timeSinceTrigger >= cooldownMs
      });
      
      // If within cooldown period, don't trigger
      if (timeSinceTrigger < cooldownMs) {
        console.log(`[AutoExpand] Cooldown active for ${eventCategory}, skipping`);
        return;
      }
    } else {
      console.log(`[AutoExpand] No previous trigger found for ${eventCategory}`);
    }
    
    console.log(`[AutoExpand] Opening workspace sidebar`);
    
    // Store timestamp in localStorage
    localStorage.setItem(storageKey, String(now));
    
    // Auto-expand the sidebar
    console.log(`[AutoExpand] Calling setWorkspaceIntelligenceOpen(true)`);
    setWorkspaceIntelligenceOpen(true);
    console.log(`[AutoExpand] workspaceIntelligenceOpen=true called`);
  }, []);

  // Listen for document uploads
  useEffect(() => {
    console.log('[AutoExpand] Registering document-uploaded event listener');
    
    const handleDocumentUpload = () => {
      console.log('[AutoExpand] document-uploaded event received');
      triggerAutoExpand('document_upload');
    };
    
    window.addEventListener('document-uploaded', handleDocumentUpload);
    console.log('[AutoExpand] document-uploaded listener mounted');
    
    return () => {
      console.log('[AutoExpand] Removing document-uploaded event listener');
      window.removeEventListener('document-uploaded', handleDocumentUpload);
    };
  }, [triggerAutoExpand]);

  // Listen for memory retrieval
  useEffect(() => {
    const handleMemoryRetrieval = () => {
      triggerAutoExpand('memory_retrieval');
    };
    
    window.addEventListener('memory-retrieved', handleMemoryRetrieval);
    return () => window.removeEventListener('memory-retrieved', handleMemoryRetrieval);
  }, [triggerAutoExpand]);

  // Listen for RAG retrieval
  useEffect(() => {
    const handleRAGRetrieval = () => {
      triggerAutoExpand('rag_retrieval');
    };
    
    window.addEventListener('rag-retrieval', handleRAGRetrieval);
    return () => window.removeEventListener('rag-retrieval', handleRAGRetrieval);
  }, [triggerAutoExpand]);

  // Listen for tool execution
  useEffect(() => {
    const handleToolExecution = () => {
      triggerAutoExpand('tool_execution');
    };
    
    window.addEventListener('tool-executed', handleToolExecution);
    return () => window.removeEventListener('tool-executed', handleToolExecution);
  }, [triggerAutoExpand]);

  // Listen for system health degradation
  useEffect(() => {
    const handleSystemDegraded = () => {
      triggerAutoExpand('system_degraded');
    };
    
    window.addEventListener('system-degraded', handleSystemDegraded);
    return () => window.removeEventListener('system-degraded', handleSystemDegraded);
  }, [triggerAutoExpand]);

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
    <div className="h-screen bg-[#fafafa] text-gray-900 font-sans flex overflow-hidden w-full">
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

            {/* Sidebar content container - Fixed height with independent scrolling */}
            <motion.div
              initial={{ x: -320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed top-0 bottom-0 left-0 w-[300px] bg-white border-r border-gray-200 z-50 lg:static lg:h-full lg:w-[320px] lg:flex-shrink-0 shadow-xl flex flex-col"
            >
              {/* Sidebar Header - Fixed */}
              <div className="flex flex-col gap-4 p-5">
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
              </div>

              {/* Conversation list - Independently scrollable */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="px-5 pb-4">
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
                    showOnboarding={showOnboarding}
                    onDismissOnboarding={dismissOnboarding}
                  />
                </div>
              </div>

              {/* Sidebar bottom block: Settings - Fixed */}
              <div className="border-t border-gray-200 pt-4 p-5 flex flex-col gap-3">
                <button
                  onClick={() => setActiveSettings(!activeSettings)}
                  className={`w-full flex items-center justify-center gap-2 text-sm font-semibold py-2.5 px-4 rounded-xl transition cursor-pointer ${
                    activeSettings
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                  }`}
                  title="Settings"
                >
                  <SettingsIcon className="w-4 h-4" />
                  Settings
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Workspace Frame - Fixed height, no scroll */}
      <div className="flex-1 flex flex-col h-full bg-[#fafafa] overflow-hidden relative">
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

        {/* Global Header Bar - Fixed */}
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

        {/* Dynamic chat interface body viewport - Independently scrollable */}
        <main className="flex-1 min-h-0 overflow-y-auto bg-[#fafafa] flex flex-col">
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
            aiMonitorData={aiMonitorData}
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

      {/* Knowledge Center Panel - Independently scrollable */}
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
        <div className="h-full flex flex-col min-h-0">
          {knowledgeOpen && (
            <KnowledgeCenter onClose={() => setKnowledgeOpen(false)} />
          )}
        </div>
      </motion.div>

      {/* Workspace Intelligence Sidebar (collapsible with animations) */}
      <AnimatePresence>
        {workspaceIntelligenceOpen && (
          <>
            {/* Backdrop for mobile/tablet */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (window.innerWidth < 1024) {
                  setWorkspaceIntelligenceOpen(false);
                }
              }}
              className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-40 lg:hidden"
            />

            {/* Sidebar content with smooth slide animation */}
            <motion.div
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ 
                type: "spring", 
                damping: 25, 
                stiffness: 220,
                mass: 0.8
              }}
              className="fixed top-0 bottom-0 right-0 w-full sm:w-[380px] bg-white border-l border-gray-200 z-50 lg:static lg:h-full lg:flex-shrink-0 shadow-2xl flex flex-col"
            >
              <WorkspaceIntelligenceSidebar 
                aiMonitorData={aiMonitorData} 
                onClose={() => setWorkspaceIntelligenceOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Right Edge Toggle Button - Always visible, draggable */}
      {!workspaceIntelligenceOpen && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleButtonClick}
          onMouseDown={handleButtonMouseDown}
          style={{ 
            position: 'fixed',
            right: 0,
            top: `${buttonY}px`,
            transform: 'translateY(-50%)',
            zIndex: 30,
          }}
          className="bg-gray-900 hover:bg-gray-800 text-white px-3 py-4 rounded-l-xl shadow-lg flex items-center gap-2 transition-colors cursor-move"
          title="Drag to reposition • Click to open"
        >
          <BrainCircuit className="w-5 h-5" />
          <span className="text-xs font-semibold whitespace-nowrap hidden sm:inline">
            AI Workspace
          </span>
        </motion.button>
      )}
    </div>
  );
}
