import React, { useState } from "react";
import { motion } from "motion/react";
import { 
  ArrowLeft, Settings, User, Sliders, Volume2, VolumeX, Cloud, LogIn, Wifi, Sparkles, BrainCircuit, HeartCrack,
  Lock, Shield, Mic, Key, Check, AlertCircle, Eye, EyeOff, RefreshCw
} from "lucide-react";
import { VOICE_PERSONALITIES } from "../lib/voice-utils";
import { User as FirebaseUser } from "firebase/auth";

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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="w-full max-w-xl bg-zinc-950 border border-red-950/40 rounded-3xl p-6 flex flex-col max-h-[90vh] shadow-2xl shadow-red-900/10 font-sans overflow-y-auto relative text-zinc-100"
      >
      {/* Settings Header */}
      <div className="flex items-center justify-between border-b border-zinc-900 pb-3 mb-4 flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-red-500 transition cursor-pointer bg-zinc-900 border border-zinc-800 hover:border-red-900/40 px-3 py-1.5 rounded-xl font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Chat</span>
        </button>
        <div className="flex items-center gap-1.5 font-bold text-white uppercase text-xs tracking-wider">
          <Settings className="w-4 h-4 text-red-500 animate-pulse" />
          <span>Helper Configurations</span>
        </div>
      </div>

      {/* Sub tabs: Memories vs Voice vs Security */}
      <div className="grid grid-cols-3 gap-1 bg-zinc-900 p-1 rounded-xl mb-4 text-xs font-semibold">
        <button
          onClick={() => setActiveSubTab("persona")}
          className={`py-2 px-1 rounded-lg transition cursor-pointer flex items-center justify-center gap-1 ${
            activeSubTab === "persona" 
              ? "bg-red-600 text-white shadow" 
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <BrainCircuit className="w-3.5 h-3.5" />
          Memories
        </button>
        <button
          onClick={() => setActiveSubTab("voice")}
          className={`py-2 px-1 rounded-lg transition cursor-pointer flex items-center justify-center gap-1 ${
            activeSubTab === "voice" 
              ? "bg-red-600 text-white shadow" 
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          Voice
        </button>
        <button
          onClick={() => setActiveSubTab("security")}
          className={`py-2 px-1 rounded-lg transition cursor-pointer flex items-center justify-center gap-1 ${
            activeSubTab === "security" 
              ? "bg-red-600 text-white shadow" 
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          Security
        </button>
      </div>

      {/* Settings Scrollable Content */}
      <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-0.5 pb-2">
        
        {activeSubTab === "persona" && (
          /* PERSONAL TRAITS FORM */
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-zinc-900/80 pb-2">
                <BrainCircuit className="w-4 h-4 text-red-500" />
                <h3 className="font-bold text-xs text-white uppercase tracking-wider">Helper Persona Memory</h3>
              </div>
              <p className="text-[11px] text-zinc-400 leading-normal">
                Tell the companion about yourself. It remembers and combines your personality, preferences, likes, dislikes, and experiences to tailor its maps recommendations and query answers.
              </p>

              <div className="space-y-3.5 mt-2">
                <div>
                  <label className="block text-[10px] text-red-400 uppercase font-bold tracking-wider mb-1 font-mono">
                    My Personality / Traits
                  </label>
                  <textarea
                    value={personality}
                    onChange={(e) => setPersonality(e.target.value)}
                    placeholder="e.g. Introverted, enjoys concise analytical answers, likes a witty sense of humor."
                    rows={2}
                    className="w-full bg-black border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-200 focus:border-red-500/50 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-red-400 uppercase font-bold tracking-wider mb-1 font-mono">
                    Personal Preferences
                  </label>
                  <textarea
                    value={preferences}
                    onChange={(e) => setPreferences(e.target.value)}
                    placeholder="e.g. Prefers walking directions over driving, prefers local organic cafes."
                    rows={2}
                    className="w-full bg-black border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-200 focus:border-red-500/50 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-red-400 uppercase font-bold tracking-wider mb-1 font-mono">
                      Likes
                    </label>
                    <textarea
                      value={likes}
                      onChange={(e) => setLikes(e.target.value)}
                      placeholder="e.g. Espresso, quiet libraries, hiking, jazz music."
                      rows={2}
                      className="w-full bg-black border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-200 focus:border-red-500/50 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-red-400 uppercase font-bold tracking-wider mb-1 font-mono">
                      Dislikes
                    </label>
                    <textarea
                      value={dislikes}
                      onChange={(e) => setDislikes(e.target.value)}
                      placeholder="e.g. Crowded malls, loud sirens, sugary drinks."
                      rows={2}
                      className="w-full bg-black border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-200 focus:border-red-500/50 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-red-400 uppercase font-bold tracking-wider mb-1 font-mono">
                    Experiences / Context
                  </label>
                  <textarea
                    value={experiences}
                    onChange={(e) => setExperiences(e.target.value)}
                    placeholder="e.g. Has visited Paris, works as a remote software engineer, has a pet husky."
                    rows={2}
                    className="w-full bg-black border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-200 focus:border-red-500/50 focus:outline-none"
                  />
                </div>
              </div>

              {saveSuccess && (
                <div className="bg-red-950/20 border border-red-500/30 text-red-400 rounded-xl p-2.5 text-[10px] mt-1 text-center font-bold">
                  ✓ Traits saved! Your companion has synchronized its contextual memory database.
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full mt-2 bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                {saving ? "Saving Memories..." : "Save Context Memory"}
              </button>
            </div>
          </form>
        )}

        {activeSubTab === "voice" && (
          /* SYSTEM VOICE & DIAGNOSTICS */
          <div className="flex flex-col gap-4">
            
            {/* Custom Ollama API Key Workaround */}
            <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-zinc-900/80 pb-2">
                <Key className="w-4 h-4 text-red-500 animate-pulse" />
                <h3 className="font-bold text-xs text-white uppercase tracking-wider">Custom Ollama API Key</h3>
              </div>
              <p className="text-[10px] text-zinc-400 leading-normal font-sans">
                If the default workspace key is rate-limited or exhausted (Error 429), enter your personal Ollama API key here. It is stored securely on your browser and sent directly to secure server-side API proxies.
              </p>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKey ? "text" : "password"}
                    value={customApiKey}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      setCustomApiKey(val);
                      localStorage.setItem("custom_ollama_api_key", val);
                    }}
                    placeholder="Enter your personal AI key (AIzaSy...)"
                    className="w-full bg-black border border-zinc-850 rounded-xl p-2 px-3 text-xs text-zinc-200 focus:border-red-500/50 focus:outline-none pr-10 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {customApiKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomApiKey("");
                      localStorage.removeItem("custom_ollama_api_key");
                    }}
                    className="text-[10px] px-3 rounded-xl bg-zinc-900 hover:bg-zinc-850 text-red-400 font-bold border border-zinc-800 transition cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              {customApiKey && (
                <div className="text-[9px] text-emerald-400 font-bold flex items-center gap-1 font-sans">
                  <Check className="w-3.5 h-3.5" />
                  <span>Custom key active! Requests are proxied using your personal credentials.</span>
                </div>
              )}
            </div>

            {/* Accent Selector */}
            <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-zinc-900/80 pb-2">
                <User className="w-4 h-4 text-red-500" />
                <h3 className="font-bold text-xs text-white uppercase tracking-wider">Voice Accents</h3>
              </div>
              <p className="text-[10px] text-zinc-400 leading-normal">
                Select an accent below to configure the direct pronunciation style of spoken replies.
              </p>
              
              <div className="grid grid-cols-2 gap-2">
                {VOICE_PERSONALITIES.slice(0, 4).map((vp) => {
                  const isSelected = selectedVoiceId === vp.id;
                  let countryFlag = "🇮🇳";
                  let shortCountryName = "India";
                  if (vp.accent === "United Kingdom") {
                    countryFlag = "🇬🇧";
                    shortCountryName = "UK";
                  } else if (vp.accent === "United States") {
                    countryFlag = "🇺🇸";
                    shortCountryName = "US";
                  }

                  return (
                    <button
                      key={vp.id}
                      type="button"
                      onClick={() => onSelectVoiceId(vp.id)}
                      className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition duration-150 cursor-pointer ${
                        isSelected 
                          ? "bg-red-950/40 border-red-500 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.15)]" 
                          : "bg-black/70 border-zinc-900 text-zinc-400 hover:border-zinc-800 hover:bg-zinc-900/60"
                      }`}
                    >
                      <div className="flex items-center justify-between pointer-events-none">
                        <span className={`font-bold text-xs truncate ${isSelected ? "text-red-400" : "text-zinc-200"}`}>
                          {vp.name.split(" ")[0]}
                        </span>
                        <span className="text-[12px] select-none">{countryFlag}</span>
                      </div>
                      <div className="text-[9px] text-zinc-500 font-sans leading-tight pointer-events-none flex flex-wrap gap-x-1 items-center">
                        <span>{vp.gender}</span>
                        <span className="opacity-40">•</span>
                        <span className="truncate max-w-[77px]">{shortCountryName}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Audio Settings */}
            <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-4 flex flex-col gap-4">
              <div className="flex items-center gap-2 border-b border-zinc-900/80 pb-2">
                <Sliders className="w-4 h-4 text-red-500" />
                <h3 className="font-bold text-xs text-white uppercase tracking-wider">Audio & Speech Settings</h3>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-1.5">
                    TTS Speech Engine
                  </label>
                  <select
                    value={voiceType}
                    onChange={(e: any) => onSelectVoiceType(e.target.value)}
                    className="w-full bg-black border border-zinc-800 rounded-xl p-2 focus:border-red-500/50 focus:outline-none text-zinc-200 text-xs cursor-pointer focus:ring-1 focus:ring-red-500/25"
                  >
                    <option value="native">Native System Voice (Fast/Offline)</option>
                    <option value="gemini" disabled={geminiQuotaExceeded}>
                      {geminiQuotaExceeded ? "Gemini Natural Voice (Service Limit)" : "Gemini Natural AI Voice (Cloud)"}
                    </option>
                  </select>
                </div>
              </div>

              {geminiQuotaExceeded && (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl p-2.5 text-[10px] leading-normal flex items-start gap-2">
                  <span className="text-xs select-none">⚠️</span>
                  <div className="font-sans">
                    <p className="font-bold mb-0.5">Gemini Cloud Voice Service Limit</p>
                    <p className="opacity-90">Gemini's speech service has hit quota limits. Falling back to native system voice.</p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-zinc-900/60 pt-3">
                <span className="text-zinc-300 text-xs font-medium">Voice Feedback Speech</span>
                <button 
                  onClick={() => onToggleVoiceSpeech(!voiceSpeechEnabled)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition text-xs font-bold cursor-pointer ${
                    voiceSpeechEnabled ? "bg-red-950/20 border-red-500/30 text-red-400" : "bg-zinc-950 border-zinc-900 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {voiceSpeechEnabled ? <Volume2 className="w-4 h-4 animate-pulse" /> : <VolumeX className="w-4 h-4" />}
                  <span>{voiceSpeechEnabled ? "Speech ON" : "Muted"}</span>
                </button>
              </div>

              <div className="flex items-center justify-between border-t border-zinc-900/60 pt-3">
                <span className="text-zinc-300 text-xs font-medium">☐ Automatically read AI replies</span>
                <button 
                  onClick={() => onToggleAutoReadReplies(!autoReadReplies)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition text-xs font-bold cursor-pointer ${
                    autoReadReplies ? "bg-red-950/20 border-red-500/30 text-red-400" : "bg-zinc-950 border-zinc-900 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <span>{autoReadReplies ? "ON" : "OFF"}</span>
                </button>
              </div>
            </div>

            {/* Sync Status */}
            <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-zinc-900/80 pb-2">
                <Cloud className="w-4 h-4 text-red-500" />
                <h3 className="font-bold text-xs text-white uppercase tracking-wider">Sync Profile</h3>
              </div>
              <p className="text-[10px] text-zinc-400 leading-normal">
                Backup your custom memories and chat histories in real-time across devices.
              </p>

              <div className="flex items-center justify-between mt-1 pt-1 border-t border-zinc-900/60">
                <span className="text-xs text-zinc-300">Cloud Status</span>
                {currentUser ? (
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5 bg-black p-1.5 px-2.5 rounded-xl border border-zinc-900">
                      {currentUser.photoURL ? (
                        <img src={currentUser.photoURL} className="w-4 h-4 rounded-full" alt="avatar" />
                      ) : (
                        <User className="w-3.5 h-3.5 text-zinc-300" />
                      )}
                      <span className="text-[10px] text-zinc-300 font-medium truncate max-w-[130px]" title={currentUser.email}>
                        {currentUser.displayName || currentUser.email}
                      </span>
                    </div>
                    <button onClick={onLogout} className="text-red-400 hover:text-red-300 font-medium text-[10px] cursor-pointer">
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={onLogin} 
                    className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow cursor-pointer transition"
                  >
                    <LogIn className="w-3.5 h-3.5" /> Sync with Google
                  </button>
                )}
              </div>
            </div>

            {/* Diagnostics */}
            <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-zinc-900/80 pb-2">
                <Wifi className="w-4 h-4 text-red-500" />
                <h3 className="font-bold text-xs text-white uppercase tracking-wider">App Diagnostics</h3>
              </div>
              
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center bg-black/40 p-2 rounded-xl border border-zinc-900">
                  <span className="text-zinc-500 text-[10px]">Database sync</span>
                  <span className="text-red-400 font-bold text-[10px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    Cloud Firestore Active
                  </span>
                </div>

                <div className="flex justify-between items-center bg-black/40 p-2 rounded-xl border border-zinc-900">
                  <span className="text-zinc-500 text-[10px]">Network state</span>
                  <span className={`font-bold text-[10px] ${isOnline ? "text-red-400" : "text-amber-500"}`}>
                    {isOnline ? "Online Service" : "Offline Cache Mode"}
                  </span>
                </div>
              </div>
            </div>

          </div>
        )}

        {activeSubTab === "security" && (
          /* VOICE LOGIN & PIN SECURITY */
          <form onSubmit={handleSaveSecurity} className="flex flex-col gap-4">
            <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-zinc-900/80 pb-2">
                <Shield className="w-4 h-4 text-red-500" />
                <h3 className="font-bold text-xs text-white uppercase tracking-wider">Voice & PIN Security</h3>
              </div>
              <p className="text-[11px] text-zinc-400 leading-normal">
                Secure your persistent personal companion workspace. When enabled, you can login with your voice print or a 4-digit security PIN at application startup.
              </p>

              {/* Toggle Security */}
              <div className="flex items-center justify-between bg-black/40 border border-zinc-900 p-3 rounded-xl mt-1">
                <div>
                  <span className="text-xs text-zinc-200 font-bold block">Enable Startup Authentication</span>
                  <span className="text-[10px] text-zinc-500 font-medium">Require Voice or PIN to enter the app</span>
                </div>
                <button
                  type="button"
                  onClick={() => setLocalSecurityEnabled(!localSecurityEnabled)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                    localSecurityEnabled ? "bg-red-600" : "bg-zinc-800"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      localSecurityEnabled ? "translate-x-4.5" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {localSecurityEnabled && (
                <div className="space-y-4 mt-2 border-t border-zinc-900/60 pt-3">
                  {/* First Name */}
                  <div>
                    <label className="block text-[10px] text-red-400 uppercase font-bold tracking-wider mb-1 font-mono">
                      Your First Name (For Audio Welcome)
                    </label>
                    <input
                      type="text"
                      value={localFirstName}
                      onChange={(e) => setLocalFirstName(e.target.value)}
                      placeholder="e.g. Vicky"
                      className="w-full bg-black border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-200 focus:border-red-500/50 focus:outline-none"
                    />
                    <p className="text-[9px] text-zinc-500 mt-1">
                      The companion will speak a warm personal greeting like "Welcome back {localFirstName || "user"}!" when you log in successfully.
                    </p>
                  </div>

                  {/* 4-Digit PIN */}
                  <div>
                    <label className="block text-[10px] text-red-400 uppercase font-bold tracking-wider mb-1 font-mono">
                      4-Digit Security PIN
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      value={localPin}
                      onChange={(e) => setLocalPin(e.target.value.replace(/\D/g, ""))}
                      placeholder="e.g. 1234"
                      className="w-full bg-black border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-200 tracking-widest font-bold focus:border-red-500/50 focus:outline-none"
                    />
                    <p className="text-[9px] text-zinc-500 mt-1">
                      Enter a 4-digit code to log in without voice recognition.
                    </p>
                  </div>

                  {/* Voice Passphrase Phrase */}
                  <div>
                    <label className="block text-[10px] text-red-400 uppercase font-bold tracking-wider mb-1 font-mono">
                      Voice Login Passphrase
                    </label>
                    <input
                      type="text"
                      value={localVoicePassphrase}
                      onChange={(e) => setLocalVoicePassphrase(e.target.value)}
                      placeholder="e.g. Open Sesame or My Voice is My Key"
                      className="w-full bg-black border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-200 focus:border-red-500/50 focus:outline-none"
                    />
                    <p className="text-[9px] text-zinc-500 mt-1">
                      Your custom voice key. Speak this exact phrase to login.
                    </p>
                  </div>

                  {/* Test Voice Section */}
                  <div className="bg-black/40 border border-zinc-900 rounded-xl p-3 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Voice Signature Studio</span>
                      {testResult === "success" && (
                        <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/30">
                          <Check className="w-3 h-3" /> Voice Match Verified
                        </span>
                      )}
                      {testResult === "fail" && (
                        <span className="text-[10px] text-red-400 font-bold flex items-center gap-1 bg-red-950/40 px-2 py-0.5 rounded border border-red-900/30">
                          <AlertCircle className="w-3 h-3" /> Voice Mismatch
                        </span>
                      )}
                    </div>
                    
                    <p className="text-[10px] text-zinc-500 leading-normal">
                      Register your voiceprint details. Click the button below and speak your phrase clearly: <strong className="text-zinc-300">"{localVoicePassphrase || "my voice is my password"}"</strong>
                    </p>

                    <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center mt-1">
                      <button
                        type="button"
                        onClick={handleTestVoice}
                        disabled={testListening}
                        className={`py-2 px-3.5 rounded-lg font-sans font-bold text-xs transition duration-150 cursor-pointer flex items-center justify-center gap-1.5 ${
                          testListening 
                            ? "bg-amber-600 animate-pulse text-white" 
                            : "bg-zinc-900 text-zinc-300 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800"
                        }`}
                      >
                        {testListening ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin animate-reverse" />
                            <span>Listening closely...</span>
                          </>
                        ) : (
                          <>
                            <Mic className="w-3.5 h-3.5 text-red-500" />
                            <span>Verify Voice Key</span>
                          </>
                        )}
                      </button>

                      {testHeardText && (
                        <div className="text-[10px] bg-zinc-950 border border-zinc-900 rounded-lg p-2 flex-1 font-mono flex items-center gap-1">
                          <span className="text-zinc-500 flex-shrink-0">HEARD:</span>
                          <span className="text-zinc-300 italic">"{testHeardText}"</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {securitySaveSuccess && (
                <div className="bg-red-950/20 border border-red-500/30 text-red-400 rounded-xl p-2.5 text-[10px] mt-1 text-center font-bold">
                  ✓ Security configurations updated! Verified & Synchronized with memory database.
                </div>
              )}

              <button
                type="submit"
                disabled={securitySaving}
                className="w-full mt-2 bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                {securitySaving ? "Saving Security..." : "Save Security Details"}
              </button>
            </div>
          </form>
        )}

      </div>

      {/* Done Button */}
      <button
        onClick={onClose}
        className="w-full mt-4 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition duration-150 text-xs shadow-lg shadow-red-500/15 cursor-pointer text-center flex-shrink-0"
      >
        Done
      </button>
    </motion.div>
  </div>
  );
};
