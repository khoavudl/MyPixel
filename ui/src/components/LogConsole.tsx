import React, { useEffect, useRef, useState } from 'react';
import {
  Terminal,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import { useInspectionStore } from '../store/useInspectionStore';
import { LogMessage } from '../types';

const PIPELINE_TASKS = [
  { id: 'task1_render', label: '1. Render PDF' },
  { id: 'task2_frame_detect', label: '2. Dò khung Vector' },
  { id: 'task3_crop', label: '3. Cắt Artboard' },
  { id: 'task4_size_gate', label: '4. Kiểm tra khổ' },
  { id: 'task5_align', label: '5. Canh khít sub-pixel' },
  { id: 'task6_fit_meter', label: '6. Đo độ khít' },
];

export const LogConsole: React.FC = () => {
  const {
    runId,
    logs,
    addLog,
    setRunStatus,
    setViewMode,
    setIsAnalyzing,
  } = useInspectionStore();

  const [activeTaskId, setActiveTaskId] = useState<string>('task1_render');
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [isDone, setIsDone] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const [autoRedirectTimer, setAutoRedirectTimer] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Auto-scroll terminal log
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Connect WebSocket when runId is ready
  useEffect(() => {
    if (!runId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/runs/${runId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = async (event) => {
      try {
        const logData: LogMessage = JSON.parse(event.data);
        addLog(logData);

        if (logData.task) {
          setActiveTaskId(logData.task);
          if (logData.status === 'SUCCESS' && logData.type === 'step_end') {
            setCompletedTasks((prev) => new Set([...prev, logData.task!]));
          }
        }

        if (logData.type === 'complete') {
          setIsDone(true);
          setIsAnalyzing(false);

          // Fetch run status to load images
          const res = await fetch(`/api/runs/${runId}`);
          if (res.ok) {
            const statusJson = await res.json();
            setRunStatus(statusJson);
          }

          // Start 3s countdown to auto-open workspace
          setAutoRedirectTimer(3);
        } else if (logData.type === 'error' || logData.status === 'FAILED') {
          setIsFailed(true);
          setIsAnalyzing(false);
        }
      } catch (e) {
        console.error('Failed to parse WS log:', e);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    return () => {
      ws.close();
    };
  }, [runId, addLog, setIsAnalyzing, setRunStatus]);

  // Handle countdown timer
  useEffect(() => {
    if (autoRedirectTimer === null) return;
    if (autoRedirectTimer <= 0) {
      setViewMode('workspace');
      return;
    }

    const timer = setTimeout(() => {
      setAutoRedirectTimer((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [autoRedirectTimer, setViewMode]);

  const progressPercentage = Math.round(
    (completedTasks.size / PIPELINE_TASKS.length) * 100
  );

  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      {/* Step Indicators */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 mb-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
              Tiến Trình Kiểm Định Phase 1
            </span>
            <h2 className="text-xl font-bold text-white mt-0.5">
              Mã phân tích: <span className="font-mono text-blue-300">{runId || '...'}</span>
            </h2>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-blue-400">{progressPercentage}%</span>
            <div className="text-xs text-slate-400">
              {completedTasks.size} / {PIPELINE_TASKS.length} tasks hoàn tất
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden mb-6 border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-300 rounded-full"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        {/* Task Steps Pill List */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {PIPELINE_TASKS.map((task) => {
            const isCompleted = completedTasks.has(task.id);
            const isCurrent = activeTaskId === task.id && !isCompleted && !isDone;

            return (
              <div
                key={task.id}
                className={`flex items-center gap-2 p-2 rounded-xl text-xs font-medium border transition-colors ${
                  isCompleted
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : isCurrent
                    ? 'bg-blue-500/15 border-blue-500/50 text-blue-300 animate-pulse'
                    : 'bg-slate-950/60 border-slate-800/80 text-slate-500'
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                ) : isCurrent ? (
                  <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-slate-700 flex-shrink-0" />
                )}
                <span className="truncate">{task.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Terminal Console View */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="bg-slate-900/80 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <div className="h-4 w-[1px] bg-slate-800 mx-2" />
            <Terminal className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-mono text-slate-400">artdiff-pipeline-stream.log</span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {isDone ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> HOÀN TẤT
              </span>
            ) : isFailed ? (
              <span className="text-red-400 font-semibold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> GẶP LỖI
              </span>
            ) : (
              <span className="text-blue-400 font-semibold flex items-center gap-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> ĐANG XỬ LÝ...
              </span>
            )}
          </div>
        </div>

        {/* Console Log Area */}
        <div
          ref={scrollRef}
          className="p-4 font-mono text-xs leading-relaxed max-h-[380px] min-h-[260px] overflow-y-auto space-y-1.5"
        >
          {logs.length === 0 ? (
            <div className="text-slate-600 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Đang kết nối WebSocket và khởi động pipeline...</span>
            </div>
          ) : (
            logs.map((log, idx) => {
              const timeStr = new Date(log.timestamp * 1000).toLocaleTimeString();
              const isError = log.type === 'error' || log.status === 'FAILED';
              const isSuccess = log.type === 'complete' || log.status === 'SUCCESS';

              return (
                <div key={idx} className="flex items-start gap-2 text-slate-300">
                  <span className="text-slate-600 select-none">[{timeStr}]</span>
                  {log.task && (
                    <span className="text-blue-400 font-semibold">[{log.task}]</span>
                  )}
                  <span
                    className={
                      isError
                        ? 'text-red-400 font-semibold'
                        : isSuccess
                        ? 'text-emerald-400'
                        : 'text-slate-300'
                    }
                  >
                    {log.message}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Failure Explanation Banner */}
        {isFailed && (
          <div className="bg-red-950/40 border-t border-red-500/30 px-6 py-3.5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs text-red-200 leading-relaxed">
              <div className="font-bold text-red-300 mb-0.5">Tiến trình kiểm định dừng lại do không khớp khổ thiết kế</div>
              <span>
                Hệ thống không tìm thấy khung kích thước trong file PDF này.
                Nếu anh đang kiểm tra bộ file <b>v1.pdf / v2.pdf (Kracks)</b>, vui lòng bấm <b>"Quay lại Cài đặt"</b> bên dưới và chọn nút khổ <b>217 × 200.5 (Kracks)</b>.
              </span>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="bg-slate-900/60 p-4 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={() => setViewMode('setup')}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Quay lại Cài đặt</span>
          </button>

          {isDone && (
            <button
              onClick={() => setViewMode('workspace')}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 cursor-pointer transition-transform hover:scale-105"
            >
              <span>Vào Trạm Kiểm Định</span>
              {autoRedirectTimer !== null && autoRedirectTimer > 0 && (
                <span className="bg-emerald-700 px-1.5 py-0.5 rounded text-[10px]">
                  {autoRedirectTimer}s
                </span>
              )}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
