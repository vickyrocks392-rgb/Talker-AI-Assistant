import React, { useState } from "react";
import { motion } from "motion/react";
import { 
  ArrowLeft, Settings, User, Sliders, Volume2, VolumeX, Cloud, LogIn, Wifi, Sparkles, HeartCrack,
  Lock, Shield, Mic, Key, Check, AlertCircle, Eye, EyeOff, RefreshCw
} from "lucide-react";
import { VOICE_PERSONALITIES } from "../lib/voice-utils";
import { User as FirebaseUser } from "firebase/auth";
import { useDialogA11y } from "../hooks/useDialogA11y";

interface VoiceSettingsProps {
  onClose: () => void;
  selectedVoiceId: string;
  onSelectVoiceId: (id: string) => void;
  voiceType: "gemini" | "native";
  onSelectVoiceType: (type: "gemini" | "native") => void;
  geminiQuotaExceeded: boolean;
  voiceSpeechEnabled: boolean;
  onToggleVoiceSpeech: (enabled: boolean) => void;
  autoReadReplies: boolean;
  onToggleAutoReadReplies: (enabled: boolean) => void;
  currentUser: FirebaseUser | null;
  onLogin: () => Promise<void>;
  onLogout: () => Promise<void>;
  isOnline: boolean;
  
  // Persona memory fields
  persona: {
    personality: string;
    preferences: string;
    likes: string;
    dislikes: string;
    experiences: string;
  };
  onSavePersona: (personaData: {
    personality: string;
    preferences: string;
    likes: string;
    dislikes: string;
    experiences: string;
  }) => Promise<void>;

  // Security props
  securityEnabled: boolean;
  pin: string;
  voicePassphrase: string;
  firstName: string;
  onSaveSecurity: (securityData: {
    securityEnabled: boolean;
    pin: string;
    voicePassphrase: string;
    firstName: string;
  }) => Promise<void>;
}

export const VoiceSettings: React.FC<VoiceSettingsProps> = ({
  onClose,
  selectedVoiceId,
  onSelectVoiceId,
  voiceType,
  onSelectVoiceType,
  geminiQuotaExceeded,
  voiceSpeechEnabled,
  onToggleVoiceSpeech,
  autoReadReplies,
  onToggleAutoReadReplies,
  currentUser,
  onLogin,
  onLogout,
  isOnline,
  persona,
  onSavePersona,
  securityEnabled,
  pin,
  voicePassphrase,
  firstName,
  onSaveSecurity
}) => {
  const [activeSubTab, setActiveSubTab] = useState<"persona" | "voice" | "security">("persona");
  
  // Custom API key workaround states
  const [customApiKey, setCustomApiKey] = useState(() => localStorage.getItem("custom_ollama_api_key") || "");
  const [showKey, setShowKey] = useState(false);
  
  // Local states for persona editing
  const [personality, setPersonality] = useState(persona.personality || "");
  const [preferences, setPreferences] = useState(persona.preferences || "");
  const [likes, setLikes] = useState(persona.likes || "");
  const [dislikes, setDislikes] = useState(persona.dislikes || "");
  const [experiences, setExperiences] = useState(persona.experiences || "");
  
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Local security states
  const [localSecurityEnabled, setLocalSecurityEnabled] = useState(securityEnabled);
  const [localPin, setLocalPin] = useState(pin || "");
  const [localVoicePassphrase, setLocalVoicePassphrase] = useState(voicePassphrase || "my voice is my password");
  const [localFirstName, setLocalFirstName] = useState(firstName || "");
  const [securitySaving, setSecuritySaving] = useState(false);
  const [securitySaveSuccess, setSecuritySaveSuccess] = useState(false);

  // Voice Test local states
  const [testListening, setTestListening] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "fail" | "idle">("idle");
  const [testHeardText, setTestHeardText] = useState("");

  // Accessibility: Escape to close, focus trap, focus restore
  const dialogRef = useDialogA11y<HTMLDivElement>(true, onClose);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      await onSavePersona({
        personality,
        preferences,
        likes,
        dislikes,
        experiences
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validations
    if (localSecurityEnabled) {
      if (!/^\d{4}$/.test(localPin)) {
        alert("PIN must be exactly 4 digits.");
        return;
      }
      if (!localVoicePassphrase.trim()) {
        alert("Please set a valid voice passphrase.");
        return;
      }
      if (!localFirstName.trim()) {
        alert("Please set your first name so the voice greeting knows what to say.");
        return;
      }
    }

    setSecuritySaving(true);
    setSecuritySaveSuccess(false);
    try {
      await onSaveSecurity({
        securityEnabled: localSecurityEnabled,
        pin: localPin,
        voicePassphrase: localVoicePassphrase,
        firstName: localFirstName
      });
      setSecuritySaveSuccess(true);
      setTimeout(() => setSecuritySaveSuccess(false), 3000);
    } catch (err) {
      console.error("Security save failed:", err);
    } finally {
      setSecuritySaving(false);
    }
  };

  const handleTestVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser environment. Voice login will still work if browser supports speech API.");
      return;
    }
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    setTestListening(true);
    setTestResult("idle");
    setTestHeardText("");

    rec.onresult = (event: any) => {
      const heard = event.results[0][0].transcript.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").trim();
      setTestHeardText(heard);
      const target = localVoicePassphrase.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").trim();
      
      if (heard.includes(target) || target.includes(heard) || heard === target) {
        setTestResult("success");
      } else {
        setTestResult("fail");
      }
    };

    rec.onerror = (err: any) => {
      console.error("Test voice error:", err);
      setTestResult("fail");
      setTestListening(false);
    };

    rec.onend = () => {
      setTestListening(false);
    };

    rec.start();
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div 
        ref={dialogRef}
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="w-full max-w-2xl bg-white border border-gray-200 rounded-2xl p-6 flex flex-col max-h-[90vh] shadow-xl font-sans overflow-y-auto relative text-gray-900 safe-top safe-bottom"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
      {/* Settings Header */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-4 mb-5 flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-600 transition cursor-pointer bg-white border border-gray-300 hover:border-red-300 hover:bg-red-50 px-3 py-2 rounded-xl font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Chat</span>
        </button>
        <div className="flex items-center gap-2 font-bold text-gray-900 uppercase text-sm tracking-wide">
          <Settings className="w-4 h-4 text-red-600" />
          <span>Settings</span>
        </div>
      </div>

      {/* Sub tabs: Memories vs Voice vs Security */}
      <div className="grid grid-cols-3 gap-2 bg-gray-100 p-1.5 rounded-xl mb-5 text-sm font-semibold">
        <button
          onClick={() => setActiveSubTab("persona")}
          className={`py-2.5 px-3 rounded-lg transition cursor-pointer flex items-center justify-center gap-2 ${
            activeSubTab === "persona" 
              ? "bg-white text-gray-900 shadow-sm" 
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Memory</span>
        </button>
        <button
          onClick={() => setActiveSubTab("voice")}
          className={`py-2.5 px-3 rounded-lg transition cursor-pointer flex items-center justify-center gap-2 ${
            activeSubTab === "voice" 
              ? "bg-white text-gray-900 shadow-sm" 
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Voice</span>
        </button>
        <button
          onClick={() => setActiveSubTab("security")}
          className={`py-2.5 px-3 rounded-lg transition cursor-pointer flex items-center justify-center gap-2 ${
            activeSubTab === "security" 
              ? "bg-white text-gray-900 shadow-sm" 
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>Security</span>
        </button>
      </div>

      {/* Settings Scrollable Content */}
      <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-0.5 pb-2">
        
        {activeSubTab === "persona" && (
          /* PERSONAL TRAITS FORM */
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
                <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-red-600">
                  <path d="M6 26V6L16 20L26 6V26" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <h3 className="font-bold text-sm text-gray-900">Memory & Preferences</h3>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">
                Help me understand you better. I'll remember your preferences and context to provide more personalized assistance.
              </p>

              <div className="space-y-4 mt-1">
                <div>
                  <label className="block text-xs text-gray-700 uppercase font-semibold tracking-wide mb-1.5">
                    Personality & Communication Style
                  </label>
                  <textarea
                    value={personality}
                    onChange={(e) => setPersonality(e.target.value)}
                    placeholder="e.g. Prefers concise answers, enjoys technical details, likes a friendly tone"
                    rows={2}
                    className="w-full bg-white border border-gray-300 rounded-xl p-3 text-sm text-gray-900 focus:border-red-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-700 uppercase font-semibold tracking-wide mb-1.5">
                    Preferences
                  </label>
                  <textarea
                    value={preferences}
                    onChange={(e) => setPreferences(e.target.value)}
                    placeholder="e.g. Prefers TypeScript, uses VS Code, works on macOS"
                    rows={2}
                    className="w-full bg-white border border-gray-300 rounded-xl p-3 text-sm text-gray-900 focus:border-red-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-700 uppercase font-semibold tracking-wide mb-1.5">
                      Interests
                    </label>
                    <textarea
                      value={likes}
                      onChange={(e) => setLikes(e.target.value)}
                      placeholder="e.g. Open source, AI, hiking"
                      rows={2}
                      className="w-full bg-white border border-gray-300 rounded-xl p-3 text-sm text-gray-900 focus:border-red-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-700 uppercase font-semibold tracking-wide mb-1.5">
                      Avoid
                    </label>
                    <textarea
                      value={dislikes}
                      onChange={(e) => setDislikes(e.target.value)}
                      placeholder="e.g. Verbose explanations, Java"
                      rows={2}
                      className="w-full bg-white border border-gray-300 rounded-xl p-3 text-sm text-gray-900 focus:border-red-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-700 uppercase font-semibold tracking-wide mb-1.5">
                    Background & Context
                  </label>
                  <textarea
                    value={experiences}
                    onChange={(e) => setExperiences(e.target.value)}
                    placeholder="e.g. Senior developer, 10 years experience, working on AI projects"
                    rows={2}
                    className="w-full bg-white border border-gray-300 rounded-xl p-3 text-sm text-gray-900 focus:border-red-500 focus:outline-none"
                  />
                </div>
              </div>

              {saveSuccess && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm text-center font-medium">
                  ✓ Memory saved successfully
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full mt-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl text-sm transition cursor-pointer"
              >
                {saving ? "Saving..." : "Save Memory"}
              </button>
            </div>
          </form>
        )}

        {activeSubTab === "voice" && (
          /* VOICE SETTINGS */
          <div className="flex flex-col gap-4">
            
            {/* Accent Selector */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
                <User className="w-5 h-5 text-red-600" />
                <h3 className="font-bold text-sm text-gray-900">Voice & Speech</h3>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">
                Configure how Noryx speaks to you. Choose a voice accent and adjust speech settings.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-700 uppercase font-semibold tracking-wide mb-2">
                    Voice Accent
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {VOICE_PERSONALITIES.slice(0, 4).map((vp) => {
                      const isSelected = selectedVoiceId === vp.id;

                      return (
                        <button
                          key={vp.id}
                          type="button"
                          onClick={() => onSelectVoiceId(vp.id)}
                          className={`p-3 rounded-xl border text-left transition duration-150 cursor-pointer ${
                            isSelected 
                              ? "bg-red-50 border-red-300 shadow-sm" 
                              : "bg-white border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <div className="font-semibold text-sm text-gray-900">
                            {vp.name.split(" ")[0]}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {vp.accent}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-700 uppercase font-semibold tracking-wide mb-2">
                    Speech Engine
                  </label>
                  <select
                    value={voiceType}
                    onChange={(e: any) => onSelectVoiceType(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl p-2.5 focus:border-red-500 focus:outline-none text-sm text-gray-900 cursor-pointer"
                  >
                    <option value="native">System Voice (Fast & Offline)</option>
                    <option value="gemini" disabled={geminiQuotaExceeded}>
                      {geminiQuotaExceeded ? "AI Voice (Service Limit)" : "AI Voice (Cloud)"}
                    </option>
                  </select>
                </div>
              </div>

              {geminiQuotaExceeded && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-sm">
                  <p className="font-semibold">AI Voice Service Limit</p>
                  <p className="text-xs mt-1">Cloud voice service has reached its quota. Using system voice instead.</p>
                </div>
              )}

              <div className="space-y-3 pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-900 font-medium">Voice Responses</span>
                  <button 
                    onClick={() => onToggleVoiceSpeech(!voiceSpeechEnabled)}
                    className={`px-4 py-2 rounded-lg border transition text-sm font-semibold cursor-pointer ${
                      voiceSpeechEnabled ? "bg-red-50 border-red-200 text-red-700" : "bg-white border-gray-300 text-gray-700"
                    }`}
                  >
                    {voiceSpeechEnabled ? "Enabled" : "Disabled"}
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-900 font-medium">Auto-read Responses</span>
                  <button 
                    onClick={() => onToggleAutoReadReplies(!autoReadReplies)}
                    className={`px-4 py-2 rounded-lg border transition text-sm font-semibold cursor-pointer ${
                      autoReadReplies ? "bg-red-50 border-red-200 text-red-700" : "bg-white border-gray-300 text-gray-700"
                    }`}
                  >
                    {autoReadReplies ? "Enabled" : "Disabled"}
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}

        {activeSubTab === "security" && (
          /* SECURITY SETTINGS */
          <form onSubmit={handleSaveSecurity} className="flex flex-col gap-4">
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
                <Shield className="w-5 h-5 text-red-600" />
                <h3 className="font-bold text-sm text-gray-900">Security & Privacy</h3>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">
                Protect your conversations with PIN or voice authentication. Your data stays private and secure.
              </p>

              {/* Toggle Security */}
              <div className="flex items-center justify-between bg-white border border-gray-200 p-4 rounded-xl">
                <div>
                  <span className="text-sm text-gray-900 font-semibold block">Enable Lock Screen</span>
                  <span className="text-xs text-gray-500">Require authentication on app launch</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={localSecurityEnabled}
                  aria-label="Enable Lock Screen"
                  onClick={() => setLocalSecurityEnabled(!localSecurityEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                    localSecurityEnabled ? "bg-red-600" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      localSecurityEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {localSecurityEnabled && (
                <div className="space-y-4 mt-1 border-t border-gray-200 pt-4">
                  {/* First Name */}
                  <div>
                    <label className="block text-xs text-gray-700 uppercase font-semibold tracking-wide mb-1.5">
                      Your First Name
                    </label>
                    <input
                      type="text"
                      value={localFirstName}
                      onChange={(e) => setLocalFirstName(e.target.value)}
                      placeholder="e.g. John"
                      className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-sm text-gray-900 focus:border-red-500 focus:outline-none"
                    />
                  </div>

                  {/* 4-Digit PIN */}
                  <div>
                    <label className="block text-xs text-gray-700 uppercase font-semibold tracking-wide mb-1.5">
                      4-Digit PIN
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      value={localPin}
                      onChange={(e) => setLocalPin(e.target.value.replace(/\D/g, ""))}
                      placeholder="e.g. 1234"
                      className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-sm text-gray-900 tracking-widest font-mono focus:border-red-500 focus:outline-none"
                    />
                  </div>

                  {/* Voice Passphrase */}
                  <div>
                    <label className="block text-xs text-gray-700 uppercase font-semibold tracking-wide mb-1.5">
                      Voice Passphrase
                    </label>
                    <input
                      type="text"
                      value={localVoicePassphrase}
                      onChange={(e) => setLocalVoicePassphrase(e.target.value)}
                      placeholder="e.g. Open Sesame"
                      className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-sm text-gray-900 focus:border-red-500 focus:outline-none"
                    />
                  </div>

                  {/* Test Voice Section */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-700 font-semibold uppercase tracking-wide">Test Voice</span>
                      {testResult === "success" && (
                        <span className="text-xs text-green-700 font-semibold flex items-center gap-1 bg-green-50 px-2 py-1 rounded-lg border border-green-200">
                          <Check className="w-3.5 h-3.5" /> Verified
                        </span>
                      )}
                      {testResult === "fail" && (
                        <span className="text-xs text-red-700 font-semibold flex items-center gap-1 bg-red-50 px-2 py-1 rounded-lg border border-red-200">
                          <AlertCircle className="w-3.5 h-3.5" /> Mismatch
                        </span>
                      )}
                    </div>
                    
                    <p className="text-xs text-gray-600">
                      Test your voice passphrase: <strong className="text-gray-900">"{localVoicePassphrase || "my voice is my password"}"</strong>
                    </p>

                    <button
                      type="button"
                      onClick={handleTestVoice}
                      disabled={testListening}
                      className={`py-2.5 px-4 rounded-lg font-semibold text-sm transition cursor-pointer flex items-center justify-center gap-2 ${
                        testListening 
                          ? "bg-amber-100 text-amber-700 border border-amber-300" 
                          : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {testListening ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Listening...</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-4 h-4 text-red-600" />
                          <span>Test Voice</span>
                        </>
                      )}
                    </button>

                    {testHeardText && (
                      <div className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5 font-mono">
                        <span className="text-gray-500">Heard:</span>
                        <span className="text-gray-900 ml-1 italic">"{testHeardText}"</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {securitySaveSuccess && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm text-center font-medium">
                  ✓ Security settings saved
                </div>
              )}

              <button
                type="submit"
                disabled={securitySaving}
                className="w-full mt-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl text-sm transition cursor-pointer"
              >
                {securitySaving ? "Saving..." : "Save Security Settings"}
              </button>
            </div>
          </form>
        )}

      </div>

      {/* Done Button */}
      <button
        onClick={onClose}
        className="w-full mt-4 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl transition text-sm shadow-sm cursor-pointer text-center flex-shrink-0"
      >
        Done
      </button>
    </motion.div>
  </div>
  );
};
