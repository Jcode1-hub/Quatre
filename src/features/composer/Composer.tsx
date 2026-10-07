"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Activity, ArrowUp, ChevronDown, FileText, ImagePlus, Mic, Paperclip, Sparkles, Square, X } from "lucide-react";
import type { Mode } from "@/lib/models";

type ModelOption = { id: string; provider: string; providerName: string; name: string; description: string; capabilities: string[]; available: boolean; supportsReasoning?: boolean; modalities?: string[] };
type Props = { prompt: string; setPrompt: (value: string) => void; busy: boolean; mode: Mode; setMode: (mode: Mode) => void; modes: Mode[]; modeLabels: Record<Mode, string>; models: ModelOption[]; selectedModel: string; setSelectedModel: (id: string) => void; usingDemo: boolean; think: boolean; setThink: (value: boolean) => void; onSubmit: () => void; onStop: () => void; error: string; retry: () => void; inputRef: RefObject<HTMLTextAreaElement | null> };
type SpeechRecognitionLike = { continuous: boolean; interimResults: boolean; lang: string; onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void; abort: () => void };
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };

export function Composer(props: Props) {
  const { prompt, setPrompt, busy, mode, setMode, modes, modeLabels, models, selectedModel, setSelectedModel, usingDemo, think, setThink, onSubmit, onStop, error, retry, inputRef } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const transcript = useRef("");
  const selected = models.find((item) => item.id === selectedModel && item.available);
  const canThink = Boolean(selected?.supportsReasoning);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [prompt, inputRef]);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);
  useEffect(() => () => recognition.current?.abort(), []);
  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [menuOpen]);

  function startVoice() {
    const Speech = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
    if (!Speech) { setSpeechError("Speech input is not available in this browser. You can still type your message."); return; }
    setSpeechError(""); setElapsed(0); transcript.current = "";
    const instance = new Speech();
    instance.continuous = true; instance.interimResults = true;
    instance.onresult = (event) => {
      const finalized = Array.from(event.results).slice(0, event.resultIndex + 1).filter((result) => result.isFinal).map((result) => result[0]?.transcript ?? "").join(" ");
      if (finalized.trim()) { transcript.current = `${transcript.current} ${finalized.trim()}`.trim(); setPrompt(`${prompt}${prompt ? " " : ""}${transcript.current}`); }
    };
    instance.onerror = () => { setRecording(false); setSpeechError("Microphone permission or speech recognition failed. Check browser permissions, then try again."); };
    instance.onend = () => setRecording(false);
    try { instance.start(); recognition.current = instance; setRecording(true); }
    catch { setSpeechError("Could not start speech input. Check microphone permission and try again."); }
  }
  function stopVoice(cancel = false) { if (cancel) recognition.current?.abort(); else recognition.current?.stop(); recognition.current = null; setRecording(false); }

  return <div className="composer-wrap">
    <div className="composer-context"><span className="context-dot"/>Personal workspace <span className="context-separator">·</span> Saved {usingDemo ? "as a preview" : "privately"}</div>
    <div className={`composer ${busy ? "composer-busy" : ""}`}>
      {menuOpen && <><button className="composer-menu-scrim" aria-label="Close attachment menu" onClick={() => setMenuOpen(false)}/><section className="attachment-menu" role="dialog" aria-modal="true" aria-label="Attachments and tools"><div className="attachment-menu-heading"><div><b>Bring something in</b><small>Conversation files are not available yet</small></div><button className="icon-button" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={16}/></button></div><div className="attachment-menu-options"><button disabled title="File uploads are coming soon"><ImagePlus/><span><b>Upload image</b><small>Image understanding · coming soon</small></span></button><button disabled title="File uploads are coming soon"><FileText/><span><b>Upload document</b><small>PDF, text and code · coming soon</small></span></button><button disabled title="Media capture is not connected"><Activity/><span><b>Choose media</b><small>Camera and device media · unavailable</small></span></button><button disabled title="No supported realtime voice provider is configured"><Mic/><span><b>Voice conversation</b><small>Live back-and-forth · coming soon</small></span></button></div><p>Files will be validated and kept private when uploads are supported.</p></section></>}
      <textarea ref={inputRef} aria-label="Your message" placeholder="Message Quatre…" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (busy) return; onSubmit(); } }} rows={1}/>
      {recording && <div className="voice-capture" role="status"><span className="voice-live-dot"/><span>Listening · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span><button onClick={() => stopVoice(true)}>Cancel</button><button onClick={() => stopVoice()}>Use transcript</button></div>}
      {speechError && <p className="composer-capability-note" role="status">{speechError}<button onClick={() => setSpeechError("")} aria-label="Dismiss">×</button></p>}
      <div className="composer-toolbar"><div className="composer-leading-actions"><button className={`attach-button ${menuOpen ? "tool-active" : ""}`} aria-label="Open attachments and tools" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Paperclip size={17}/></button><div className="select-wrap"><span className="select-label">STYLE</span><select aria-label="How should Quatre help?" value={mode} onChange={(event) => setMode(event.target.value as Mode)}>{modes.map((item) => <option value={item} key={item}>{modeLabels[item]}</option>)}</select><ChevronDown size={13}/></div><div className="toolbar-divider"/><div className="select-wrap model-select"><span className="select-label">MODEL</span><select aria-label="Preferred AI model" value={usingDemo ? "demo" : selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>{usingDemo && <option value="demo">Preview responses</option>}{!usingDemo && models.map((item) => <option value={item.id} key={item.id} disabled={!item.available}>{item.name}{item.available ? ` · ${item.providerName}` : " · Unavailable"}</option>)}</select><ChevronDown size={13}/></div></div><div className="composer-trailing-actions"><button className={`think-button ${think && canThink ? "think-active" : ""}`} aria-pressed={think && canThink} disabled={!canThink || busy} title={canThink ? "Ask for more reasoning effort. Private reasoning stays private." : "Deeper reasoning is unavailable for this model."} onClick={() => setThink(!think)}><Sparkles size={14}/><span>Think</span></button><button className="voice-button" aria-label={recording ? "Stop recording" : "Dictate a message"} title="Dictate into your message" onClick={() => recording ? stopVoice() : startVoice()}>{recording ? <Square size={14}/> : <Mic size={16}/>}</button><span className="composer-hint">Shift + Enter for new line</span>{busy ? <button className="send-button stop-button" onClick={onStop} aria-label="Stop generating"><Square size={13}/></button> : <button className="send-button" disabled={!prompt.trim()} onClick={onSubmit} aria-label="Send message"><ArrowUp size={17}/></button>}</div></div>
    </div>{error && <p className="error-message" role="alert">{error}<button onClick={retry}>Try again</button></p>}<div className="disclaimer"><span>{usingDemo ? "PREVIEW MODE" : think && canThink ? "DEEPER THINKING" : "QUATRE COORDINATION"}</span>{usingDemo ? "Preview responses are illustrative. Connect an AI provider for live answers." : "Your conversation is sent securely to the selected provider."}</div>
  </div>;
}
