export type SpeakResult = "ok" | "missing";

function chineseVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang.toLowerCase().replace("_", "-").startsWith("zh-tw")) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("zh"))
  );
}

export function speak(text: string): Promise<SpeakResult> {
  if (!("speechSynthesis" in window) || !text.trim()) return Promise.resolve("missing");
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0 && !chineseVoice()) return Promise.resolve("missing");
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-TW";
    utterance.rate = 0.82;
    const voice = chineseVoice();
    if (voice) utterance.voice = voice;
    utterance.onend = () => resolve("ok");
    utterance.onerror = () => resolve("missing");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}
