import React, { useEffect, useState } from 'react';
import { AlertCircle, Lock } from 'lucide-react';
import { QuizziGameItem } from '../../types';
import { fetchPublicFreeAiGameById } from '../../services/gameStorageService';

interface PublicGamePlayerViewProps {
  gameId: string;
}

type FetchState = 'loading' | 'ok' | 'disabled' | 'not_found' | 'error';

export const PublicGamePlayerView: React.FC<PublicGamePlayerViewProps> = ({ gameId }) => {
  const [fetchState, setFetchState] = useState<FetchState>('loading');
  const [game, setGame] = useState<QuizziGameItem | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setFetchState('loading');
      setGame(null);
      setErrorMessage('');

      const res = await fetchPublicFreeAiGameById(gameId);
      if (cancelled) return;

      if (res.status === 'ok') {
        setGame(res.game);
        setFetchState('ok');
      } else if (res.status === 'disabled') {
        setFetchState('disabled');
      } else if (res.status === 'not_found') {
        setFetchState('not_found');
      } else {
        setErrorMessage(res.message || 'Không thể tải trò chơi. Vui lòng thử lại sau.');
        setFetchState('error');
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  if (fetchState === 'loading') {
    return (
      <div className="fixed inset-0 w-screen h-screen bg-slate-50 flex items-center justify-center p-4 font-sans antialiased">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="space-y-1">
            <h2 className="text-base font-black text-slate-900">Đang mở trò chơi...</h2>
            <p className="text-xs text-slate-500">Vui lòng chờ trong giây lát.</p>
          </div>
        </div>
      </div>
    );
  }

  if (fetchState === 'disabled') {
    return (
      <div className="fixed inset-0 w-screen h-screen bg-slate-50 flex items-center justify-center p-4 font-sans antialiased">
        <div className="bg-white rounded-3xl border border-amber-200 shadow-sm p-8 max-w-md w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
            <Lock className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-black text-slate-900">Liên kết trò chơi đã tạm tắt</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Giáo viên hiện đã tắt chia sẻ liên kết cho trò chơi này. Em hãy liên hệ thầy/cô để được mở lại nhé.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (fetchState === 'not_found' || fetchState === 'error' || !game?.htmlContent) {
    return (
      <div className="fixed inset-0 w-screen h-screen bg-slate-50 flex items-center justify-center p-4 font-sans antialiased">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 max-w-md w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-black text-slate-900">
              {fetchState === 'error' ? 'Không thể tải trò chơi' : 'Không tìm thấy trò chơi'}
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {fetchState === 'error'
                ? errorMessage
                : 'Liên kết trò chơi không đúng hoặc trò chơi đã bị xóa khỏi hệ thống.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-white">
      <iframe
        srcDoc={game.htmlContent}
        title={game.title || 'Trò chơi học tập'}
        sandbox="allow-scripts"
        className="w-full h-full border-0 block"
      />
    </div>
  );
};
