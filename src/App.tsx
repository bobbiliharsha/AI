/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Bot, 
  MessageSquare, 
  Briefcase, 
  Palette, 
  BarChart3, 
  Code2, 
  PenTool, 
  Microscope, 
  Zap, 
  Volume2, 
  VolumeX, 
  RotateCcw, 
  Mic, 
  Paperclip, 
  Send, 
  ChevronDown, 
  Download,
  X,
  FileText
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI } from "@google/genai";

interface Mode {
  label: string;
  icon: string;
  color: string;
  tagline: string;
  desc: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  mode?: string;
  thinking?: string;
  brain?: any;
  trace?: any[];
  fileUrl?: string;
  files?: string[];
  image?: string;
}

const MODE_ICONS: Record<string, any> = {
  agent: Bot,
  chatbot: MessageSquare,
  coworker: Briefcase,
  designer: Palette,
  analyst: BarChart3,
  coder: Code2,
  writer: PenTool,
  researcher: Microscope,
};

export default function App() {
  const [modes, setModes] = useState<Record<string, Mode>>({});
  const [currentMode, setCurrentMode] = useState("chatbot");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [typingMsg, setTypingMsg] = useState("Processing...");
  const [showThink, setShowThink] = useState(true);
  const [voiceOn, setVoiceOn] = useState(true);
  const [brainStatus, setBrainStatus] = useState<any>({});
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; type: string; text?: string; b64?: string; mime?: string }[]>([]);
  const [outputFmt, setOutputFmt] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastTrace, setLastTrace] = useState<any[]>([]);
  const [lastBrain, setLastBrain] = useState<any>(null);

  const msgsRef = useRef<HTMLDivElement>(null);
  const textInRef = useRef<HTMLTextAreaElement>(null);
  const fileInRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchModes();
    fetchStatus();
    const interval = setInterval(fetchStatus, 12000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (msgsRef.current) {
      msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const fetchModes = async () => {
    try {
      const res = await fetch("/api/modes");
      const data = await res.json();
      setModes(data);
    } catch (e) {
      console.error("Failed to fetch modes", e);
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      setBrainStatus(data);
    } catch (e) {
      console.error("Failed to fetch status", e);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() && attachedFiles.length === 0) return;
    if (isTyping) return;

    stopSpeak();

    const userMsg: Message = {
      role: "user",
      content: inputText || (attachedFiles.length > 0 ? "📎 " + attachedFiles.map(f => f.name).join(", ") : ""),
      files: attachedFiles.filter(f => f.type !== "image").map(f => f.name),
      image: attachedFiles.find(f => f.type === "image")?.b64
    };

    setMessages(prev => [...prev, userMsg]);
    const currentInput = inputText;
    const currentFiles = [...attachedFiles];
    
    setInputText("");
    setAttachedFiles([]);
    setIsTyping(true);
    setTypingMsg("Running 17 brain layers...");

    setTimeout(() => setTypingMsg("L15★ causal inference..."), 600);
    setTimeout(() => setTypingMsg("L16★ schema check..."), 1200);
    setTimeout(() => setTypingMsg("L17★ transfer bridge..."), 1800);
    setTimeout(() => setTypingMsg(`Generating ${modes[currentMode]?.label || "response"}...`), 2400);

    try {
      const payload = {
        text: currentInput || (currentFiles.some(f => f.text) ? "Analyze the attached content." : "Describe this image."),
        mode: currentMode,
        file_texts: currentFiles.filter(f => f.text).map(f => `[FILE: ${f.name}]\n${f.text}`),
        image: currentFiles.find(f => f.type === "image")?.b64,
        output_format: outputFmt,
        history: messages.slice(-12).map(m => ({ role: m.role, content: m.content })),
      };

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const brainData = await res.json();
      
      if (brainData.error) {
        throw new Error(brainData.error);
      }

      // Call Gemini from Frontend
      const genAI = new GoogleGenAI({ apiKey: (process.env as any).GEMINI_API_KEY });
      
      const contents: any[] = [];
      // Add history
      if (payload.history && payload.history.length > 0) {
        for (const h of payload.history) {
          contents.push({
            role: h.role === "user" ? "user" : "model",
            parts: [{ text: h.content }],
          });
        }
      }

      // Add current message
      const currentParts: any[] = [{ text: payload.text }];
      if (payload.image) {
        const base64Data = payload.image.split(",")[1] || payload.image;
        currentParts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Data,
          },
        });
      }

      contents.push({
        role: "user",
        parts: currentParts,
      });

      const result = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents,
        config: {
          systemInstruction: brainData.systemInstruction,
        },
      });

      const responseText = result.text || "No response text generated.";

      // Tell backend to remember
      fetch("/api/remember", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: responseText,
          modeId: currentMode,
          topic: brainData.brain?.cs?.topic
        })
      });

      const assistantMsg: Message = {
        role: "assistant",
        content: responseText,
        mode: currentMode,
        brain: brainData.brain,
        trace: brainData.trace,
        fileUrl: brainData.file_url,
      };

      setMessages(prev => [...prev, assistantMsg]);
      setLastTrace(brainData.trace || []);
      setLastBrain(brainData.brain || null);
      setIsTyping(false);
      fetchStatus();

      if (voiceOn && responseText) {
        speakText(responseText);
      }
    } catch (e: any) {
      console.error("Chat error", e);
      const errorMsg: Message = {
        role: "assistant",
        content: `Error: ${e.message}. Please ensure your Gemini API key is valid in the Settings menu.`,
      };
      setMessages(prev => [...prev, errorMsg]);
      setIsTyping(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const fileObj of files) {
      const file = fileObj as File;
      const reader = new FileReader();
      if (file.type.startsWith("image/")) {
        reader.onload = (event) => {
          setAttachedFiles(prev => [...prev, {
            name: file.name,
            type: "image",
            b64: event.target?.result as string,
            mime: file.type
          }]);
        };
        reader.readAsDataURL(file);
      } else {
        reader.onload = (event) => {
          setAttachedFiles(prev => [...prev, {
            name: file.name,
            type: "text",
            text: event.target?.result as string
          }]);
        };
        reader.readAsText(file);
      }
    }
    if (fileInRef.current) fileInRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const newChat = async () => {
    await fetch("/api/clear", { method: "POST" });
    setMessages([]);
    setLastTrace([]);
    setLastBrain(null);
    fetchStatus();
  };

  const speakText = (text: string) => {
    if (!voiceOn || !window.speechSynthesis || !text) return;
    stopSpeak();
    const clean = text.replace(/```[\s\S]*?```/g, "(code block)").replace(/[#*`>\[\]★]/g, "").replace(/\n+/g, " ").trim().slice(0, 900);
    if (!clean) return;
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 0.95;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeak = () => {
    if (window.speechSynthesis?.speaking) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  const renderMd = (text: string) => {
    if (!text) return { __html: "" };
    // Simple markdown renderer as in original code
    let s = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    s = s.replace(/```(\w*)\n([\s\S]*?)```/g, (_, l, c) => `<pre><code>${c.trim()}</code></pre>`);
    s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    s = s.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    s = s.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    s = s.replace(/^# (.+)$/gm, "<h1>$1</h1>");
    s = s.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
    s = s.replace(/^[*\-+] (.+)$/gm, "<li>$1</li>");
    s = s.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
    s = s.replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>");
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    s = s.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>");
    return { __html: "<p>" + s + "</p>" };
  };

  const ModeIcon = (id: string) => {
    const Icon = MODE_ICONS[id] || MessageSquare;
    return <Icon size={16} />;
  };

  return (
    <div className="app grid grid-cols-[220px_1fr_290px] h-screen">
      {/* LEFT SIDEBAR */}
      <div className="sb bg-[var(--sb)] border-r border-[var(--bdr)] flex flex-col overflow-hidden">
        <div className="sb-top p-[16px_14px_12px] border-b border-[var(--bdr)]">
          <div className="logo font-serif text-[19px] font-bold tracking-[-0.5px] bg-linear-to-br from-[var(--mode)] to-[#22d3ee] bg-clip-text text-transparent">
            HARSHA
          </div>
          <div className="logo-sub text-[9px] color-[var(--t3)] tracking-[2px] mt-[2px]">
            SUPER SYSTEM · ALL AI IN ONE
          </div>
          <div className="brain-pill inline-flex items-center gap-[4px] mt-[8px] p-[3px_9px] rounded-[20px] text-[8px] font-bold tracking-[1px] bg-[rgba(74,140,255,0.08)] border border-[rgba(74,140,255,0.2)] text-[#4a8cff]">
            <div className="bp-dot w-[4px] h-[4px] rounded-full bg-[#34d399]"></div>
            HARSHA-AGI v6.0 · 17 LAYERS
          </div>
        </div>

        <div className="modes-label text-[9px] color-[var(--t3)] tracking-[2px] uppercase p-[10px_14px_6px]">
          AI Modes
        </div>
        <div className="modes-list flex-1 overflow-y-auto px-[8px]">
          {Object.entries(modes).map(([id, m]) => (
            <div
              key={id}
              className={`mode-btn flex items-center gap-[9px] p-[9px_10px] rounded-[8px] cursor-pointer transition-all mb-[2px] border border-transparent relative overflow-hidden ${
                currentMode === id ? "active bg-[var(--surf)] border-[var(--bdr2)]" : "hover:bg-[var(--surf)] hover:border-[var(--bdr)]"
              }`}
              onClick={() => setCurrentMode(id)}
            >
              {currentMode === id && <div className="absolute left-0 w-[2px] h-full bg-[var(--mode)] rounded-[1px]"></div>}
              <span className="mode-ico text-[16px] shrink-0 w-[22px] text-center">{(m as Mode).icon}</span>
              <div className="mode-info flex-1 min-w-0">
                <div className={`mode-name text-[11px] font-bold ${currentMode === id ? "text-[var(--text)]" : "text-[var(--t2)]"}`}>
                  {(m as Mode).label}
                </div>
                <div className="mode-tag text-[9px] text-[var(--t3)] mt-[1px] whitespace-nowrap overflow-hidden text-ellipsis">
                  {(m as Mode).tagline}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="brain-mini p-[10px_14px] border-t border-[var(--bdr)]">
          <div className="bm-row flex justify-between text-[10px] mb-[3px]">
            <span className="bm-k text-[var(--t3)]">Cycle</span>
            <span className="bm-v text-[var(--t2)] font-bold text-[#22d3ee]">{brainStatus.cycle || 0}</span>
          </div>
          <div className="bm-row flex justify-between text-[10px] mb-[3px]">
            <span className="bm-k text-[var(--t3)]">Memory</span>
            <span className="bm-v text-[var(--t2)] font-bold">{brainStatus.memory || 0}</span>
          </div>
          <div className="bm-row flex justify-between text-[10px] mb-[3px]">
            <span className="bm-k text-[var(--t3)]">Journey</span>
            <span className="bm-v text-[var(--t2)] font-bold">{(brainStatus.journey || 0).toFixed(3)}u</span>
          </div>
          <div className="bm-row flex justify-between text-[10px] mb-[3px]">
            <span className="bm-k text-[var(--t3)]">Dominant</span>
            <span className="bm-v text-[var(--t2)] font-bold text-[#34d399]">{brainStatus.dominant || "—"}</span>
          </div>
          <div className="bm-row flex justify-between text-[10px] mb-[3px]">
            <span className="bm-k text-[var(--t3)]">API</span>
            <span className={`bm-v font-bold ${brainStatus.api ? "text-[#34d399]" : "text-[#fbbf24]"}`}>
              {brainStatus.api ? "CONNECTED" : "LOCAL"}
            </span>
          </div>
        </div>
        <div
          className="new-btn m-[8px_14px] p-[7px] rounded-[6px] text-center text-[11px] font-bold cursor-pointer transition-all bg-[rgba(74,140,255,0.06)] border border-[rgba(74,140,255,0.2)] text-[#4a8cff] hover:bg-[rgba(74,140,255,0.15)]"
          onClick={newChat}
        >
          + New Conversation
        </div>
      </div>

      {/* MAIN CHAT AREA */}
      <div className="main flex flex-col min-w-0 overflow-hidden">
        <div className="chat-hdr p-[11px_20px] border-b border-[var(--bdr)] flex items-center justify-between bg-[var(--sb)] shrink-0">
          <div className="hdr-left flex items-center gap-[10px]">
            <div className="mode-badge flex items-center gap-[6px] p-[4px_11px] rounded-[5px] bg-[var(--surf)] border border-[var(--bdr2)] text-[11px] font-bold">
              <span className="mode-badge-ico text-[14px]">{modes[currentMode]?.icon}</span>
              <span className="mode-badge-name text-[var(--mode)]">{modes[currentMode]?.label}</span>
            </div>
            <div className="hdr-model text-[10px] text-[var(--t3)]">
              {brainStatus.api ? "gemini-1.5-flash" : "checking..."}
            </div>
          </div>
          <div className="hbtns flex gap-[6px]">
            <button
              className={`hbtn p-[4px_10px] rounded-[5px] text-[10px] font-bold cursor-pointer border transition-all font-mono ${
                showThink ? "bg-[rgba(74,140,255,0.1)] border-[#4a8cff] text-[#4a8cff]" : "border-[var(--bdr)] bg-[var(--surf)] text-[var(--t2)] hover:border-[#22d3ee] hover:text-[#22d3ee]"
              }`}
              onClick={() => setShowThink(!showThink)}
            >
              ⚡ Thinking
            </button>
            <button
              className={`hbtn p-[4px_10px] rounded-[5px] text-[10px] font-bold cursor-pointer border transition-all font-mono ${
                voiceOn ? "bg-[rgba(74,140,255,0.1)] border-[#4a8cff] text-[#4a8cff]" : "border-[var(--bdr)] bg-[var(--surf)] text-[var(--t2)] hover:border-[#22d3ee] hover:text-[#22d3ee]"
              }`}
              onClick={() => {
                setVoiceOn(!voiceOn);
                if (voiceOn) stopSpeak();
              }}
            >
              {voiceOn ? "🔊 Voice" : "🔇 Muted"}
            </button>
            <button
              className="hbtn p-[4px_10px] rounded-[5px] text-[10px] font-bold cursor-pointer border border-[var(--bdr)] bg-[var(--surf)] text-[var(--t2)] hover:border-[#22d3ee] hover:text-[#22d3ee] transition-all font-mono"
              onClick={newChat}
            >
              ↺ Clear
            </button>
          </div>
        </div>

        <div className="msgs flex-1 overflow-y-auto p-[20px] flex flex-col gap-[16px]" ref={msgsRef}>
          {messages.length === 0 && modes[currentMode] && (
            <div className="msg agent flex gap-[11px] animate-fup">
              <div className="av w-[32px] h-[32px] rounded-[8px] flex items-center justify-center text-[18px] font-bold shrink-0 bg-[var(--surf2)] border border-[var(--bdr2)]">
                {modes[currentMode].icon}
              </div>
              <div className="mbody max-w-[min(74%,700px)]">
                <div className="bubble p-[11px_15px] rounded-[11px] rounded-tl-[3px] leading-[1.72] text-[13px] bg-[var(--surf)] border border-[var(--bdr2)]">
                  <div className="mode-strip h-[2px] rounded-[1px] mb-[8px] opacity-70" style={{ background: modes[currentMode].color }}></div>
                  <div style={{ borderLeft: `3px solid ${modes[currentMode].color}`, paddingLeft: "14px", marginBottom: "4px" }}>
                    <div style={{ fontFamily: "var(--font-serif)", fontSize: "17px", fontWeight: "600", color: modes[currentMode].color, marginBottom: "6px" }}>
                      {modes[currentMode].icon} {modes[currentMode].label}
                    </div>
                    <div style={{ color: "var(--t2)", lineHeight: "1.7" }}>{modes[currentMode].desc}</div>
                  </div>
                </div>
                <div className="mmeta text-[9px] text-[var(--t3)] mt-[5px]">
                  HARSHA-AGI v6.0 · 17 layers · {modes[currentMode].label} mode active
                </div>
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`msg flex gap-[11px] animate-fup ${m.role === "user" ? "user flex-row-reverse" : "agent"}`}>
              <div
                className={`av w-[32px] h-[32px] rounded-[8px] flex items-center justify-center font-bold shrink-0 ${
                  m.role === "user"
                    ? "bg-linear-to-br from-[#4a8cff] to-[#a78bfa] text-white text-[12px] font-serif"
                    : "text-[18px] bg-[var(--surf2)] border border-[var(--bdr2)]"
                }`}
              >
                {m.role === "user" ? "U" : modes[m.mode || currentMode]?.icon || "🤖"}
              </div>
              <div className={`mbody max-w-[min(74%,700px)] ${m.role === "user" ? "flex flex-col items-end" : ""}`}>
                {m.thinking && showThink && (
                  <div className="think-wrap bg-[rgba(167,139,250,0.05)] border border-[rgba(167,139,250,0.15)] rounded-[7px] mb-[9px] overflow-hidden">
                    <details className="group">
                      <summary className="think-hdr flex items-center justify-between p-[7px_11px] cursor-pointer text-[10px] text-[#a78bfa] font-bold list-none">
                        <span>⚡ Internal reasoning ({m.thinking.length} chars)</span>
                        <ChevronDown size={10} className="transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="think-body p-[9px_13px] text-[10px] text-[var(--t3)] leading-[1.7] border-t border-[rgba(167,139,250,0.1)] max-h-[240px] overflow-y-auto whitespace-pre-wrap">
                        {m.thinking}
                      </div>
                    </details>
                  </div>
                )}
                <div
                  className={`bubble p-[11px_15px] rounded-[11px] leading-[1.72] text-[13px] ${
                    m.role === "user"
                      ? "bg-[rgba(74,140,255,0.1)] border border-[rgba(74,140,255,0.2)] rounded-tr-[3px]"
                      : "bg-[var(--surf)] border border-[var(--bdr2)] rounded-tl-[3px]"
                  }`}
                >
                  {m.role === "assistant" && (
                    <div
                      className="mode-strip h-[2px] rounded-[1px] mb-[8px] opacity-70"
                      style={{ background: modes[m.mode || currentMode]?.color }}
                    ></div>
                  )}
                  {m.files && m.files.map((n, idx) => (
                    <div key={idx} className="text-[11px] mb-[4px] flex items-center gap-1">
                      <FileText size={12} /> {n}
                    </div>
                  ))}
                  {m.image && (
                    <img src={m.image} className="max-w-[180px] rounded-[7px] mb-[7px] block" alt="User upload" />
                  )}
                  <div className="markdown-body" dangerouslySetInnerHTML={renderMd(m.content)}></div>
                  {m.fileUrl && (
                    <a className="dl inline-flex items-center gap-[5px] mt-[9px] p-[5px_11px] bg-[rgba(74,140,255,0.1)] border border-[rgba(74,140,255,0.2)] rounded-[5px] text-[#22d3ee] text-[10px] no-underline transition-all hover:bg-[rgba(74,140,255,0.2)]" href={m.fileUrl} download>
                      <Download size={12} /> Download .{outputFmt || "file"}
                    </a>
                  )}
                </div>
                <div className="mmeta text-[9px] text-[var(--t3)] mt-[5px]">
                  {m.role === "user"
                    ? "User Input"
                    : `${modes[m.mode || currentMode]?.label || "HARSHA"} · Cycle ${m.brain?.cycle || 0} · Journey ${(m.brain?.identity?.journey || 0).toFixed(3)}u · ${m.brain?.memories_used || 0} memories`}
                </div>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="t-wrap flex gap-[11px] px-[20px] pb-[10px]">
              <div className="av w-[32px] h-[32px] rounded-[8px] flex items-center justify-center text-[18px] font-bold shrink-0 bg-[var(--surf2)] border border-[var(--bdr2)]">
                {modes[currentMode]?.icon}
              </div>
              <div className="t-dots flex items-center gap-[4px] p-[9px_13px] bg-[var(--surf)] border border-[var(--bdr2)] rounded-[11px] rounded-tl-[3px]">
                <span className="w-[5px] h-[5px] rounded-full bg-[var(--mode)]"></span>
                <span className="w-[5px] h-[5px] rounded-full bg-[var(--mode)]"></span>
                <span className="w-[5px] h-[5px] rounded-full bg-[var(--mode)]"></span>
                <span className="t-st text-[10px] text-[var(--t3)] ml-[7px] self-center">{typingMsg}</span>
              </div>
            </div>
          )}
        </div>

        <div className="input-area p-[12px_20px_16px] bg-[var(--sb)] border-t border-[var(--bdr)] shrink-0">
          <div className="att-row flex flex-wrap gap-[5px] mb-[7px]">
            {attachedFiles.map((f, i) => (
              <div key={i} className="att-chip inline-flex items-center gap-[5px] p-[3px_8px] bg-[var(--surf2)] border border-[var(--bdr)] rounded-[4px] text-[10px] text-[var(--t2)]">
                {f.type === "image" ? "🖼" : "📄"} {f.name}
                <X size={10} className="rm cursor-pointer text-[var(--t3)] hover:text-[#f87171]" onClick={() => removeFile(i)} />
              </div>
            ))}
          </div>
          <div className="ibox flex items-end gap-[6px] bg-[var(--surf)] border border-[var(--bdr2)] rounded-[11px] padding-[8px_10px] p-2 transition-all focus-within:border-[var(--mode)]">
            <textarea
              ref={textInRef}
              className="flex-1 bg-transparent border-none outline-none text-[var(--text)] font-mono text-[13px] leading-[1.6] resize-none min-h-[22px] max-h-[140px] p-[2px_0]"
              placeholder={modes[currentMode]?.tagline || "Ask me anything..."}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                if (textInRef.current) {
                  textInRef.current.style.height = "auto";
                  textInRef.current.style.height = Math.min(textInRef.current.scrollHeight, 140) + "px";
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <div className="ib-acts flex items-center gap-[5px] shrink-0">
              <button className="ib w-[30px] h-[30px] rounded-[6px] border border-[var(--bdr)] bg-transparent text-[var(--t3)] cursor-pointer text-[14px] flex items-center justify-center transition-all hover:border-[#22d3ee] hover:text-[#22d3ee] hover:bg-[rgba(34,211,238,0.06)]">
                <Mic size={14} />
              </button>
              <button
                className="ib w-[30px] h-[30px] rounded-[6px] border border-[var(--bdr)] bg-transparent text-[var(--t3)] cursor-pointer text-[14px] flex items-center justify-center transition-all hover:border-[#22d3ee] hover:text-[#22d3ee] hover:bg-[rgba(34,211,238,0.06)]"
                onClick={() => fileInRef.current?.click()}
              >
                <Paperclip size={14} />
              </button>
              <input type="file" ref={fileInRef} className="hidden" multiple onChange={handleFileChange} />
              <button
                className="send w-[33px] h-[33px] rounded-[8px] border-none bg-linear-to-br from-[var(--mode)] to-[#22d3ee] text-white cursor-pointer text-[14px] flex items-center justify-center transition-all hover:scale-105 hover:shadow-[0_0_16px_rgba(74,140,255,0.4)] disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={handleSend}
                disabled={isTyping || (!inputText.trim() && attachedFiles.length === 0)}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
          <div className="out-row flex items-center gap-[5px] mt-[8px] flex-wrap">
            <span className="out-lbl text-[9px] text-[var(--t3)] tracking-[1.5px] uppercase">Save as:</span>
            {["", "md", "py", "html", "sql", "json", "docx", "txt"].map((fmt) => (
              <button
                key={fmt}
                className={`fmt p-[3px_7px] rounded-[4px] border border-[var(--bdr)] bg-transparent text-[var(--t3)] text-[9px] cursor-pointer font-mono transition-all hover:border-[#22d3ee] hover:text-[#22d3ee] ${
                  outputFmt === fmt ? "sel bg-[rgba(74,140,255,0.1)] border-[var(--mode)] text-[var(--mode)]" : ""
                }`}
                onClick={() => setOutputFmt(fmt)}
              >
                {fmt === "" ? "Text" : fmt.toUpperCase()}
              </button>
            ))}
          </div>
          {isSpeaking && (
            <div className="spk-row flex items-center gap-[5px] mt-[5px] text-[9px] text-[var(--t3)]">
              <div className="sbars flex gap-[2px]">
                <div className="sbar w-[2px] h-[5px] bg-[#22d3ee] rounded-[1px]"></div>
                <div className="sbar w-[2px] h-[9px] bg-[#22d3ee] rounded-[1px] delay-150"></div>
                <div className="sbar w-[2px] h-[5px] bg-[#22d3ee] rounded-[1px] delay-300"></div>
              </div>
              Speaking...
            </div>
          )}
        </div>
      </div>

      {/* RIGHT BRAIN TRACE */}
      <div className="trace bg-[var(--sb)] border-l border-[var(--bdr)] flex flex-col overflow-hidden">
        <div className="tr-hdr p-[11px_14px] border-b border-[var(--bdr)] shrink-0 flex items-center gap-[6px] text-[9px] text-[var(--t3)] tracking-[2px] uppercase">
          <div className="tr-dot w-[5px] h-[5px] rounded-full bg-[#4a8cff]"></div>
          Brain · 17 Layers · Live
        </div>
        <div className="tr-scroll flex-1 overflow-y-auto p-[12px_14px]">
          {lastTrace.length === 0 ? (
            <div className="tr-idle text-[11px] text-[var(--t3)] leading-[1.85] p-[4px_0] italic">
              The HARSHA-AGI brain narrates itself here as it processes your input through all 17 layers.
              <br />
              <br />
              Every mode — Coder, Designer, Analyst, Writer, Agent, Coworker, Researcher, Chatbot — runs on the same
              persistent brain. Memory, identity, personality, and causal understanding carry across every mode switch.
              <br />
              <br />
              Select a mode and send a message.
            </div>
          ) : (
            <div className="tr-items">
              <div className="tr-mode-bar text-center text-[9px] text-[var(--t3)] tracking-[2px] uppercase my-[8px] p-[4px] border-y border-[var(--bdr)]" style={{ color: modes[lastBrain?.mode]?.color }}>
                {modes[lastBrain?.mode]?.icon} {modes[lastBrain?.mode]?.label || "HARSHA"} Mode
              </div>
              {lastTrace.map((t, i) => {
                const lid = t.layer.replace(/[★*]/g, "").trim().split(/[^\w]/)[0];
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="tl mb-[12px]"
                  >
                    <div className={`tl-id inline-flex items-center gap-[4px] text-[8px] font-bold tracking-[1.5px] uppercase p-[2px_8px] rounded-[3px] mb-[4px] l-${lid} ${
                      lid === "L4" ? "bg-[rgba(74,140,255,0.08)] border border-[rgba(74,140,255,0.15)] text-[#4a8cff]" :
                      lid === "L0" ? "bg-[rgba(34,211,238,0.1)] border border-[rgba(34,211,238,0.2)] text-[#22d3ee]" :
                      lid === "L1" ? "bg-[rgba(34,211,238,0.08)] border border-[rgba(34,211,238,0.12)] text-[#22d3ee]" :
                      lid === "L2" ? "bg-[rgba(251,191,36,0.1)] border border-[rgba(251,191,36,0.2)] text-[#fbbf24]" :
                      lid === "L7" ? "bg-[rgba(167,139,250,0.1)] border border-[rgba(167,139,250,0.2)] text-[#a78bfa]" :
                      lid === "L14" ? "bg-[rgba(34,211,238,0.08)] border border-[rgba(34,211,238,0.12)] text-[#22d3ee]" :
                      lid === "L15" ? "bg-[rgba(251,191,36,0.12)] border border-[rgba(251,191,36,0.2)] text-[#fbbf24]" :
                      lid === "L16" ? "bg-[rgba(52,211,153,0.1)] border border-[rgba(52,211,153,0.2)] text-[#34d399]" :
                      lid === "L17" ? "bg-[rgba(34,211,238,0.12)] border border-[rgba(34,211,238,0.25)] text-[#22d3ee]" :
                      lid === "STORE" ? "bg-[rgba(74,140,255,0.08)] border border-[rgba(74,140,255,0.15)] text-[#4a8cff]" : ""
                    }`}>
                      {t.layer} — {t.name}
                    </div>
                    <div className="tl-voice text-[11px] leading-[1.75] text-[var(--t2)] border-l-2 border-[var(--bdr2)] pl-[10px]">
                      {t.voice}
                    </div>
                  </motion.div>
                );
              })}
              {lastBrain && (
                <div className="sum bg-[var(--surf)] border border-[var(--bdr)] rounded-[6px] p-[8px_10px] mt-[10px] text-[10px] text-[var(--t2)] leading-[1.7]">
                   <strong style={{ color: modes[lastBrain.mode]?.color }}>Brain state after this cycle</strong><br />
                   Drive: {lastBrain.drive?.type || "—"} · Journey: {(lastBrain.identity?.journey || 0).toFixed(4)}u<br />
                   {lastBrain.causal && <>Causal: {lastBrain.causal.slice(0, 60)}<br /></>}
                   {lastBrain.schemas?.length > 0 && <>Schemas: {lastBrain.schemas.slice(0, 3).join(", ")}</>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
