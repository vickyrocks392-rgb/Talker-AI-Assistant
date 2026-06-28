export interface VoicePersonality {
  id: string;
  name: string;
  gender: "Female" | "Male";
  accent: "Indian" | "United Kingdom" | "United States";
  langCode: string;
  keywords: string[];
  geminiVoice: "Zephyr" | "Kore" | "Puck" | "Fenrir" | "Aoede" | "Charon";
}

export const VOICE_PERSONALITIES: VoicePersonality[] = [
  {
    id: "in_female",
    name: "Aditi (Female, Indian)",
    gender: "Female",
    accent: "Indian",
    langCode: "en-IN",
    keywords: ["aditi", "veena", "heera", "india", "in", "female"],
    geminiVoice: "Aoede"
  },
  {
    id: "in_male",
    name: "Rohan (Male, Indian)",
    gender: "Male",
    accent: "Indian",
    langCode: "en-IN",
    keywords: ["rohan", "ravi", "india", "in", "male"],
    geminiVoice: "Kore"
  },
  {
    id: "uk_female",
    name: "Olivia (Female, British)",
    gender: "Female",
    accent: "United Kingdom",
    langCode: "en-GB",
    keywords: ["olivia", "hazel", "susangb", "united kingdom", "gb", "uk", "female"],
    geminiVoice: "Zephyr"
  },
  {
    id: "uk_male",
    name: "Oliver (Male, British)",
    gender: "Male",
    accent: "United Kingdom",
    langCode: "en-GB",
    keywords: ["oliver", "george", "united kingdom", "gb", "uk", "male"],
    geminiVoice: "Puck"
  },
  {
    id: "us_female",
    name: "Sophia (Female, American)",
    gender: "Female",
    accent: "United States",
    langCode: "en-US",
    keywords: ["sophia", "zira", "samantha", "united states", "us", "female", "googleus"],
    geminiVoice: "Zephyr"
  },
  {
    id: "us_male",
    name: "Ethan (Male, American)",
    gender: "Male",
    accent: "United States",
    langCode: "en-US",
    keywords: ["ethan", "david", "mark", "united states", "us", "male", "googleus"],
    geminiVoice: "Fenrir"
  }
];

export const findBestNativeVoice = (
  langCode: string,
  gender: "male" | "female",
  keywords: string[],
  textContainsHindi: boolean
): SpeechSynthesisVoice | null => {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  // If text contains Hindi, prioritize hi-IN voices if available
  const targetLangCode = textContainsHindi ? "hi-IN" : langCode;

  // Filter by matching lang code first
  let matches = voices.filter(v => v.lang.toLowerCase().replace("_", "-").startsWith(targetLangCode.toLowerCase().substring(0, 5)));

  if (matches.length === 0) {
    const targetShortLang = textContainsHindi ? "hi" : langCode.substring(0, 2);
    matches = voices.filter(v => v.lang.toLowerCase().replace("_", "-").startsWith(targetShortLang));
  }

  if (matches.length > 0) {
    const ranked = matches.map(voice => {
      let score = 0;
      const voiceName = voice.name.toLowerCase();
      
      const nameHasFemale = voiceName.includes("female") || voiceName.includes("zira") || voiceName.includes("samantha") || voiceName.includes("hazel") || voiceName.includes("heera") || voiceName.includes("aditi") || voiceName.includes("veena");
      const nameHasMale = voiceName.includes("male") || voiceName.includes("david") || voiceName.includes("ravi") || voiceName.includes("rohan") || voiceName.includes("george");
      
      if (gender === "female") {
        if (nameHasFemale) score += 10;
        if (nameHasMale) score -= 10;
      } else {
        if (nameHasMale) score += 10;
        if (nameHasFemale) score -= 10;
      }

      for (const kw of keywords) {
        if (voiceName.includes(kw.toLowerCase())) {
          score += 5;
        }
      }

      // Heavily prioritize natural neural, premium, siri, or first-party platform high-quality voices to sound completely lifelike
      const isPremium = 
        voiceName.includes("natural") || 
        voiceName.includes("neural") || 
        voiceName.includes("siri") || 
        voiceName.includes("premium") || 
        voiceName.includes("high quality") || 
        voiceName.includes("google") || 
        voiceName.includes("microsoft");
      if (isPremium) {
        score += 35;
      }

      return { voice, score };
    });

    ranked.sort((a,b) => b.score - a.score);
    return ranked[0].voice;
  }

  return voices.find(v => v.lang.toLowerCase().replace("_", "-").startsWith(targetLangCode.toLowerCase().substring(0, 2))) || null;
};
