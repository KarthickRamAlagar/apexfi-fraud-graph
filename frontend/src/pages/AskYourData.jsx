import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Send, Volume2, VolumeX, RotateCcw, Database, AlertCircle, Globe } from 'lucide-react'
import { Panel } from '@/components/Panel'
import GovEmblem from '@/components/GovEmblem'
import { cn } from '@/lib/utils'
import { suggestedQuestions, LANGUAGES } from '@/lib/mockAsk'

const API_BASE = 'http://localhost:8000'

const MAX_QUESTIONS = 5
const RESET_MS = 5 * 60 * 1000 // 5 minutes

export default function AskYourData() {
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState('idle')
  const [result, setResult] = useState(null)
  const [count, setCount] = useState(0)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(true)
  const [lang, setLang] = useState('en-IN')
  const [resetToast, setResetToast] = useState(false)
  const recognitionRef = useRef(null)
  const resetTimerRef = useRef(null)

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setSpeechSupported(false)
      return
    }
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = lang

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join('')
      setInput(transcript)
    }
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
  }, [lang])

  // 5-minute session reset once the limit is hit
  useEffect(() => {
    if (count >= MAX_QUESTIONS) {
      resetTimerRef.current = setTimeout(() => {
        setCount(0)
        setResetToast(true)
        speakText('Your session has been reset. You can ask 5 more questions now.')
        setTimeout(() => setResetToast(false), 6000)
      }, RESET_MS)
    }
    return () => clearTimeout(resetTimerRef.current)
  }, [count])

  function toggleListening() {
    if (!speechSupported || count >= MAX_QUESTIONS) return
    if (listening) {
      recognitionRef.current.stop()
      setListening(false)
    } else {
      setInput('')
      recognitionRef.current.start()
      setListening(true)
    }
  }

  async function handleAsk(question) {
    const q = question ?? input
    if (!q.trim() || count >= MAX_QUESTIONS) return

    setPhase('thinking')
    try {
      const res = await fetch(`${API_BASE}/api/ask/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, language: lang }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResult({
          question: q,
          answer: data.detail || 'Something went wrong answering this question.',
          supportingData: [],
          source: null,
          isFallback: true,
        })
      } else {
        setResult({
          question: q,
          answer: data.answer,
          // real SQL results shown as supporting data chips, first 4 columns
          supportingData: data.results.length > 0
            ? Object.entries(data.results[0]).slice(0, 4).map(([label, value]) => ({ label, value: String(value) }))
            : [],
          source: `${data.sql} (via ${data.provider})`,
          isFallback: false,
        })
      }
    } catch (err) {
      setResult({
        question: q,
        answer: "Couldn't reach the backend — make sure it's running.",
        supportingData: [],
        source: null,
        isFallback: true,
      })
    }
    setCount((c) => c + 1)
    setPhase('answered')
  }

  function handleAskAnother() {
    setResult(null)
    setInput('')
    setPhase('idle')
    window.speechSynthesis?.cancel()
    setSpeaking(false)
  }

  function speakText(text, speakLang) {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    // Real LLM answers are generated directly in the user's chosen language
    // (a genuine translation, not a hand-written mock one), so speak them in
    // that language rather than forcing English.
    utterance.lang = speakLang || 'en-IN'
    utterance.onend = () => setSpeaking(false)
    setSpeaking(true)
    window.speechSynthesis.speak(utterance)
  }

  function playAnswer() {
    if (!result?.answer) return
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    speakText(result.answer, lang)
  }

  const remaining = MAX_QUESTIONS - count
  const limitReached = remaining <= 0
  const emblemState = listening ? 'listening' : speaking ? 'speaking' : 'idle'

  return (
    <div className="container py-8">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">ApexFi / Ask your data</p>
        <h1 className="mt-1 font-display text-2xl font-semibold">Ask your data</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask a question in plain English or by voice — answered from the real Gold layer.
        </p>
      </div>

      {/* language disclaimer */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
        <Globe size={14} className="shrink-0 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          You can speak or type in:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                lang === l.code
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* reset toast */}
      <AnimatePresence>
        {resetToast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="status"
            className="mb-4 flex items-center gap-2 rounded-lg border border-risk-low/40 bg-risk-low/10 px-4 py-2.5 text-xs text-risk-low"
          >
            <RotateCcw size={13} />
            Your session has been reset — you can ask {MAX_QUESTIONS} more questions now.
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[300px_1fr]">
        <div className="flex flex-col items-center justify-center pt-2">
          <GovEmblem state={emblemState} />
        </div>

        <Panel>
          <AnimatePresence mode="wait">
            {phase !== 'answered' ? (
              <motion.div
                key="input"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {remaining} of {MAX_QUESTIONS} questions remaining this session
                  </span>
                  <div className="h-1.5 w-32 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${(count / MAX_QUESTIONS) * 100}%` }}
                    />
                  </div>
                </div>

                {limitReached && (
                  <div className="mb-4 flex items-start gap-2 rounded-lg border border-risk-medium/40 bg-risk-medium/10 px-4 py-3 text-xs text-risk-medium">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>
                      You have reached your limit for this short session (5 mins)! It will reset after
                      5 minutes.
                    </span>
                  </div>
                )}

                <div className="mb-4 flex flex-wrap gap-2">
                  {suggestedQuestions.map((sq) => (
                    <button
                      key={sq.question}
                      onClick={() => handleAsk(lang === 'en-IN' ? sq.question : sq.translations[lang]?.question || sq.question)}
                      disabled={limitReached || phase === 'thinking'}
                      className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {lang === 'en-IN' ? sq.question : sq.translations[lang]?.question || sq.question}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                    placeholder={
                      limitReached
                        ? "You've used all 5 questions for this session"
                        : listening
                          ? 'Listening — speak your question…'
                          : 'Type or speak your question…'
                    }
                    disabled={limitReached}
                    className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
                  />
                  {speechSupported && (
                    <button
                      onClick={toggleListening}
                      disabled={limitReached}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                        listening ? 'bg-risk-medium text-background' : 'text-muted-foreground hover:bg-secondary'
                      )}
                      aria-label="Ask by voice"
                    >
                      <Mic size={15} />
                    </button>
                  )}
                  <button
                    onClick={() => handleAsk()}
                    disabled={!input.trim() || limitReached || phase === 'thinking'}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Ask"
                  >
                    <Send size={14} />
                  </button>
                </div>

                {!speechSupported && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Voice input isn't supported in this browser — try Chrome for speech-to-text.
                  </p>
                )}
                {listening && (
                  <p className="mt-2 text-xs text-risk-medium">
                    Live transcript shown above as you speak — visible for anyone who can't rely on audio.
                  </p>
                )}
                {phase === 'thinking' && (
                  <p className="mt-3 text-xs text-muted-foreground">Retrieving from the Gold layer…</p>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="answer"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <p className="text-xs text-muted-foreground">You asked</p>
                <p className="mt-1 text-sm font-medium">{result.question}</p>

                <div
                  className={cn(
                    'mt-4 rounded-lg border p-4',
                    result.isFallback ? 'border-risk-medium/40 bg-risk-medium/10' : 'border-primary/30 bg-primary/5'
                  )}
                >
                  {result.isFallback && (
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-risk-medium">
                      <AlertCircle size={13} />
                      Not a database-backed answer — demo mode
                    </p>
                  )}
                  <p className="text-base leading-relaxed">{result.answer}</p>
                  <button
                    onClick={playAnswer}
                    className="mt-3 flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    {speaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
                    {speaking ? 'Stop reading aloud' : 'Read answer aloud'}
                  </button>
                </div>

                {result.supportingData.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Database size={12} />
                      Retrieved from {result.source}
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {result.supportingData.map((d) => (
                        <div key={d.label} className="rounded-lg bg-secondary/40 p-2.5 text-center">
                          <div className="text-[10px] text-muted-foreground">{d.label}</div>
                          <div className="font-mono text-sm font-semibold tabular-nums">{d.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-5 border-t border-border/60 pt-4">
                  {limitReached && (
                    <div className="mb-4 flex items-start gap-2 rounded-lg border border-risk-medium/40 bg-risk-medium/10 px-4 py-3 text-xs text-risk-medium">
                      <AlertCircle size={14} className="mt-0.5 shrink-0" />
                      <span>
                        You have reached your limit for this short session (5 mins)! It will reset
                        after 5 minutes — this page will show a confirmation and read it aloud when
                        that happens.
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {remaining} question{remaining !== 1 ? 's' : ''} remaining
                    </span>
                    <button
                      onClick={handleAskAnother}
                      disabled={limitReached}
                      title={limitReached ? 'Available again once your 5-minute session resets' : undefined}
                      className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <RotateCcw size={12} />
                      Ask another
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Panel>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Regional-language text is machine-translated for this demo and has not been reviewed by a
        native speaker — verify before using in a live presentation.
      </p>
    </div>
  )
}
