import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  Upload, 
  CheckCircle2, 
  XCircle, 
  ArrowRight, 
  RotateCcw, 
  BrainCircuit, 
  Loader2,
  Trophy,
  AlertCircle,
  Clock,
  Lightbulb,
  Sparkles
} from 'lucide-react';
import { cn } from './lib/utils';
import { Question, AppState, EvaluationResult } from './types';
import { generateQuestionsFromImages, evaluateAnswers, generateRetryQuestions } from './services/gemini';

export default function App() {
  const [state, setState] = useState<AppState>('upload');
  const [questionBank, setQuestionBank] = useState<Question[]>([]);
  const [currentTest, setCurrentTest] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [showHint, setShowHint] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15 * 60);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [hasOfferedBonus, setHasOfferedBonus] = useState(false);

  useEffect(() => {
    let timer: any;
    if ((state === 'quiz' || state === 'bonus_offer') && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleFinish();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [state, timeLeft]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    setState('processing');
    setError(null);
    setHasOfferedBonus(false);

    try {
      const base64Promises = acceptedFiles.map(file => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

      const base64Images = await Promise.all(base64Promises);
      setImagePreviews(base64Images);

      const questions = await generateQuestionsFromImages(base64Images);
      if (!questions || questions.length === 0) {
        throw new Error("Nepodarilo sa vygenerovať žiadne otázky. Skúste iné fotky.");
      }
      setQuestionBank(questions);
      startNewTest(questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nastala neočakávaná chyba');
      setState('upload');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: {
      'image/jpeg': ['.jpeg', '.jpg'],
      'image/png': ['.png'],
    },
    multiple: true
  } as any);

  const startNewTest = (bank: Question[]) => {
    const shuffled = [...bank].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 15); // At least 15 questions
    setCurrentTest(selected);
    setCurrentIndex(0);
    setUserAnswers({});
    setTimeLeft(15 * 60);
    setShowHint(false);
    setHasOfferedBonus(false);
    setState('quiz');
  };

  const handleRetry = async () => {
    if (!evaluation) return;
    
    setIsRetrying(true);
    setHasOfferedBonus(false);
    const failedIndices = evaluation.details.filter(d => !d.isCorrect).map(d => d.questionIndex);
    const failedQuestions = failedIndices.map(idx => currentTest[idx]);
    
    if (failedQuestions.length === 0) {
      startNewTest(questionBank);
      setIsRetrying(false);
      return;
    }

    try {
      const retryQuestions = await generateRetryQuestions(failedQuestions);
      // Fill the rest with new questions from bank if needed
      let finalTest = [...retryQuestions];
      if (finalTest.length < 15) {
        const remainingNeeded = 15 - finalTest.length;
        const usedIds = new Set(failedQuestions.map(q => q.id));
        const extra = questionBank.filter(q => !usedIds.has(q.id)).sort(() => 0.5 - Math.random()).slice(0, remainingNeeded);
        finalTest = [...finalTest, ...extra];
      }
      
      setCurrentTest(finalTest.sort(() => 0.5 - Math.random()));
      setCurrentIndex(0);
      setUserAnswers({});
      setTimeLeft(15 * 60);
      setShowHint(false);
      setState('quiz');
    } catch (err) {
      startNewTest(questionBank);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleAnswer = (answer: string) => {
    setUserAnswers(prev => ({ ...prev, [currentIndex]: answer }));
  };

  const nextQuestion = () => {
    setShowHint(false);
    if (currentIndex + 1 < currentTest.length) {
      setCurrentIndex(prev => prev + 1);
    } else {
      if (!hasOfferedBonus && timeLeft > 0 && questionBank.length > currentTest.length) {
        setState('bonus_offer');
      } else {
        handleFinish();
      }
    }
  };

  const startBonus = () => {
    setHasOfferedBonus(true);
    const usedIds = new Set(currentTest.map(q => q.id));
    const bonus = questionBank
      .filter(q => !usedIds.has(q.id))
      .sort(() => 0.5 - Math.random())
      .slice(0, 5);
    
    if (bonus.length === 0) {
      handleFinish();
      return;
    }

    setCurrentTest(prev => [...prev, ...bonus]);
    setCurrentIndex(prev => prev + 1);
    setState('quiz');
  };

  const handleFinish = async () => {
    setState('evaluating');
    try {
      const result = await evaluateAnswers(currentTest, userAnswers);
      setEvaluation({
        score: result.score,
        total: currentTest.length,
        details: result.details
      });
      setState('results');
    } catch (err) {
      setError("Nepodarilo sa vyhodnotiť test. Skúste to znova.");
      setState('results');
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const renderUpload = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto mt-12 p-8"
    >
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold text-slate-900 mb-4 tracking-tight">
          Snap<span className="text-blue-600">Test</span>
        </h1>
        <p className="text-xl text-slate-600">
          Nafot učebnicu a AI ti okamžite vytvorí test na precvičenie.
        </p>
      </div>

      <div 
        {...getRootProps()} 
        className={cn(
          "border-4 border-dashed rounded-3xl p-12 transition-all cursor-pointer flex flex-col items-center justify-center min-h-[300px]",
          isDragActive ? "border-blue-500 bg-blue-50 scale-102" : "border-slate-200 hover:border-blue-400 hover:bg-slate-50"
        )}
      >
        <input {...getInputProps()} />
        <div className="bg-blue-100 p-6 rounded-full mb-6">
          <Camera className="w-12 h-12 text-blue-600" />
        </div>
        <p className="text-xl font-medium text-slate-700 mb-2 text-center">
          {isDragActive ? "Pustite fotky sem..." : "Kliknite alebo potiahnite fotky učebnice (aj viac naraz)"}
        </p>
        <p className="text-slate-500">Podporuje JPG, PNG</p>
      </div>

      {error && (
        <div className="mt-8 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { icon: Camera, title: "Nafotíš", desc: "Jednu alebo viac strán" },
          { icon: BrainCircuit, title: "AI spracuje", desc: "Vytvorí 15+ otázok s nápovedami" },
          { icon: Trophy, title: "Testuješ", desc: "AI vyhodnotí aj preklepy" }
        ].map((step, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center">
            <step.icon className="w-8 h-8 text-blue-500 mx-auto mb-3" />
            <h3 className="font-bold text-slate-900">{step.title}</h3>
            <p className="text-sm text-slate-500">{step.desc}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );

  const renderProcessing = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        className="mb-8"
      >
        <Loader2 className="w-16 h-16 text-blue-600" />
      </motion.div>
      <h2 className="text-3xl font-bold text-slate-900 mb-4">Mágia v procese...</h2>
      <p className="text-xl text-slate-600 max-w-md">
        AI práve číta tvoje učebnice a vymýšľa tie najlepšie otázky.
      </p>
      {imagePreviews.length > 0 && (
        <div className="mt-12 flex flex-wrap justify-center gap-4 opacity-30 grayscale blur-[1px]">
          {imagePreviews.slice(0, 3).map((img, i) => (
            <img key={i} src={img} alt={`Preview ${i}`} className="max-w-[120px] rounded-lg shadow-lg" />
          ))}
        </div>
      )}
    </div>
  );

  const renderEvaluating = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
      <motion.div
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className="mb-8"
      >
        <Sparkles className="w-16 h-16 text-blue-600" />
      </motion.div>
      <h2 className="text-3xl font-bold text-slate-900 mb-4">AI opravuje tvoj test...</h2>
      <p className="text-xl text-slate-600 max-w-md">
        Kontrolujeme tvoje odpovede, preklepy a gramatiku. Chvíľočku strpenia.
      </p>
    </div>
  );

  const renderBonusOffer = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 max-w-2xl mx-auto">
      <div className="bg-blue-100 p-6 rounded-full mb-8">
        <Sparkles className="w-16 h-16 text-blue-600" />
      </div>
      <h2 className="text-4xl font-bold text-slate-900 mb-4">Bonusová výzva!</h2>
      <p className="text-xl text-slate-600 mb-8">
        Stíhaš to skvele! Máš ešte <span className="font-bold text-blue-600">{formatTime(timeLeft)}</span> času. 
        Chceš skúsiť <span className="font-bold text-blue-600">5 bonusových otázok</span> a vylepšiť si skóre?
      </p>
      <div className="flex flex-col sm:flex-row gap-4 w-full">
        <button
          onClick={startBonus}
          className="flex-1 px-8 py-4 bg-blue-600 text-white rounded-2xl font-bold text-xl hover:bg-blue-700 transition-all shadow-lg flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="w-6 h-6" />
          Jasné, poďme na to!
        </button>
        <button
          onClick={handleFinish}
          className="flex-1 px-8 py-4 bg-slate-100 text-slate-700 rounded-2xl font-bold text-xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
        >
          <ArrowRight className="w-6 h-6" />
          Nie, stačilo mi
        </button>
      </div>
    </div>
  );

  const renderQuiz = () => {
    const q = currentTest[currentIndex];
    const progress = ((currentIndex + 1) / currentTest.length) * 100;

    return (
      <div className="max-w-3xl mx-auto mt-12 p-6">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-slate-100">
            <Clock className={cn("w-5 h-5", timeLeft < 60 ? "text-red-500 animate-pulse" : "text-blue-500")} />
            <span className={cn("font-mono font-bold text-lg", timeLeft < 60 ? "text-red-600" : "text-slate-700")}>
              {formatTime(timeLeft)}
            </span>
          </div>
          <div className="text-right">
            <span className="text-sm font-bold text-blue-600 uppercase tracking-wider">
              {hasOfferedBonus ? "Bonusová otázka" : "Otázka"} {currentIndex + 1} z {currentTest.length}
            </span>
          </div>
        </div>

        <div className="mb-8">
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className={cn("h-full", hasOfferedBonus ? "bg-purple-600" : "bg-blue-600")}
            />
          </div>
        </div>

        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className={cn(
            "bg-white rounded-3xl p-8 shadow-xl border relative overflow-hidden",
            hasOfferedBonus ? "border-purple-100" : "border-slate-100"
          )}
        >
          {hasOfferedBonus && (
            <div className="absolute top-0 right-0 bg-purple-600 text-white px-4 py-1 rounded-bl-xl text-xs font-bold uppercase tracking-widest">
              Bonus
            </div>
          )}
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-8 leading-tight">
            {q.question}
          </h2>

          <div className="space-y-4">
            {q.type === 'short' ? (
              <input 
                type="text"
                placeholder="Napíš svoju odpoveď..."
                className="w-full p-4 text-lg border-2 border-slate-200 rounded-2xl focus:border-blue-500 focus:outline-none transition-colors"
                value={userAnswers[currentIndex] || ''}
                onChange={(e) => handleAnswer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && userAnswers[currentIndex] && nextQuestion()}
                autoFocus
              />
            ) : (
              q.options.map((option, i) => (
                <button
                  key={i}
                  onClick={() => handleAnswer(option)}
                  className={cn(
                    "w-full p-5 text-left text-lg font-medium rounded-2xl border-2 transition-all flex items-center justify-between group",
                    userAnswers[currentIndex] === option 
                      ? (hasOfferedBonus ? "border-purple-600 bg-purple-50 text-purple-700" : "border-blue-600 bg-blue-50 text-blue-700")
                      : "border-slate-100 hover:border-blue-200 hover:bg-slate-50 text-slate-700"
                  )}
                >
                  <span>{option}</span>
                  <div className={cn(
                    "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                    userAnswers[currentIndex] === option 
                      ? (hasOfferedBonus ? "border-purple-600 bg-purple-600" : "border-blue-600 bg-blue-600")
                      : "border-slate-200 group-hover:border-blue-300"
                  )}>
                    {userAnswers[currentIndex] === option && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </div>
                </button>
              ))
            )}
          </div>

          <AnimatePresence>
            {showHint && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-6 p-4 bg-yellow-50 border border-yellow-100 rounded-2xl flex gap-3 text-yellow-800"
              >
                <Lightbulb className="w-5 h-5 flex-shrink-0 mt-1" />
                <p className="italic">{q.hint}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-12 flex justify-between items-center">
            <button
              onClick={() => setShowHint(true)}
              disabled={showHint}
              className={cn(
                "flex items-center gap-2 font-bold transition-all",
                showHint ? "text-slate-300" : "text-yellow-600 hover:text-yellow-700"
              )}
            >
              <Lightbulb className="w-5 h-5" />
              Potrebujem nápovedu
            </button>
            <button
              disabled={!userAnswers[currentIndex]}
              onClick={nextQuestion}
              className={cn(
                "px-8 py-4 rounded-2xl font-bold text-lg flex items-center gap-2 transition-all shadow-lg",
                userAnswers[currentIndex] 
                  ? (hasOfferedBonus ? "bg-purple-600 hover:bg-purple-700" : "bg-blue-600 hover:bg-blue-700") + " text-white hover:translate-x-1" 
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              )}
            >
              {currentIndex + 1 === currentTest.length ? "Dokončiť test" : "Ďalšia otázka"}
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      </div>
    );
  };

  const renderResults = () => {
    if (!evaluation) return null;
    const percentage = (evaluation.score / evaluation.total) * 100;
    
    let feedback = "Skús to znova!";
    let color = "text-red-600";
    if (percentage >= 80) {
      feedback = "Výborne! Si expert.";
      color = "text-green-600";
    } else if (percentage >= 60) {
      feedback = "Dobrá práca!";
      color = "text-blue-600";
    }

    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-3xl mx-auto mt-12 p-6"
      >
        <div className="bg-white rounded-3xl p-10 shadow-2xl border border-slate-100 text-center mb-8">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-blue-50 rounded-full mb-6">
            <Trophy className="w-12 h-12 text-blue-600" />
          </div>
          <h2 className="text-4xl font-bold text-slate-900 mb-2">Tvoj výsledok</h2>
          <p className={cn("text-6xl font-black mb-4", color)}>{evaluation.score} / {evaluation.total}</p>
          <p className="text-2xl font-medium text-slate-600 mb-8">{feedback}</p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg disabled:opacity-50"
            >
              {isRetrying ? <Loader2 className="w-5 h-5 animate-spin" /> : <RotateCcw className="w-5 h-5" />}
              Opravný test (zameraný na chyby)
            </button>
            <button
              onClick={() => setState('upload')}
              className="px-8 py-4 bg-slate-100 text-slate-700 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 hover:bg-slate-200 transition-all"
            >
              <Upload className="w-5 h-5" />
              Iná učebnica
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <h3 className="text-2xl font-bold text-slate-900 px-4">AI Vyhodnotenie</h3>
          {currentTest.map((q, i) => {
            const detail = evaluation.details.find(d => d.questionIndex === i);
            const isCorrect = detail?.isCorrect;
            return (
              <div key={i} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex gap-4">
                <div className="mt-1">
                  {isCorrect ? <CheckCircle2 className="w-6 h-6 text-green-500" /> : <XCircle className="w-6 h-6 text-red-500" />}
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-slate-900 mb-2">{q.question}</h4>
                  <p className="text-sm text-slate-500 mb-1">Tvoja odpoveď: <span className={isCorrect ? "text-green-600 font-medium" : "text-red-600 font-medium"}>{userAnswers[i] || '-'}</span></p>
                  <div className="mt-2 p-3 bg-slate-50 rounded-xl text-sm text-slate-600 border border-slate-100 italic">
                    {detail?.aiExplanation}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      <nav className="bg-white border-b border-slate-100 px-6 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setState('upload')}>
            <div className="bg-blue-600 p-2 rounded-lg">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-black tracking-tight">SnapTest</span>
          </div>
          <div className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-500">
            <span className="text-blue-600">Pre žiakov</span>
            <span>Pre učiteľov</span>
          </div>
        </div>
      </nav>

      <main>
        <AnimatePresence mode="wait">
          {state === 'upload' && renderUpload()}
          {state === 'processing' && renderProcessing()}
          {state === 'quiz' && renderQuiz()}
          {state === 'bonus_offer' && renderBonusOffer()}
          {state === 'evaluating' && renderEvaluating()}
          {state === 'results' && renderResults()}
        </AnimatePresence>
      </main>
    </div>
  );
}
