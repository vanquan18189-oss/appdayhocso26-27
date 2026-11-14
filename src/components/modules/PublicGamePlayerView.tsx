import React, { useEffect, useState } from 'react';
import {
  fetchPublicGameForGuest,
  getSavedGuestStudentProfile,
  GuestStudentProfile,
  PublicGameFetchedData,
} from '../../services/publicGuestService';
import { GuestStudentEntryForm } from '../common/GuestStudentEntryForm';
import { InteractiveGamesModule } from './InteractiveGamesModule';
import { studentResultService } from '../../services/studentResultService';
import { joinQuizLiveSession } from '../../services/liveQuizSessionService';
import { AlertCircle, ExternalLink, Home, Play, RefreshCw } from 'lucide-react';

interface PublicGamePlayerViewProps {
  gameId: string;
  onGoHome?: () => void;
}

export const PublicGamePlayerView: React.FC<PublicGamePlayerViewProps> = ({
  gameId,
  onGoHome,
}) => {
  const [gameData, setGameData] = useState<PublicGameFetchedData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [guestProfile, setGuestProfile] = useState<GuestStudentProfile | null>(() =>
    getSavedGuestStudentProfile()
  );
  const [isStarted, setIsStarted] = useState(false);

  const loadGame = async () => {
    setIsLoading(true);
    try {
      const res = await fetchPublicGameForGuest(gameId);
      if (res.status === 'ok') {
        setGameData(res.data);
      } else {
        setGameData(null);
      }
    } catch (e) {
      console.error('Error loading public game:', e);
      setGameData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadGame();
  }, [gameId]);

  const handleGoHome = () => {
    if (onGoHome) {
      onGoHome();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-700 font-extrabold text-base">
          Đang tải trò chơi học tập...
        </p>
      </div>
    );
  }

  if (!gameData) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4 shadow-sm">
          <AlertCircle size={40} />
        </div>
        <h2 className="text-xl font-black text-slate-900 mb-2">
          Không tìm thấy trò chơi
        </h2>
        <p className="text-slate-600 max-w-md mb-6 text-sm">
          Trò chơi này không tồn tại, đã bị xóa hoặc đường dẫn chia sẻ không hợp lệ.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={loadGame}
            className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition flex items-center gap-2"
          >
            <RefreshCw size={16} /> Thử tải lại
          </button>
          <button
            onClick={handleGoHome}
            className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition flex items-center gap-2"
          >
            <Home size={16} /> Về trang chủ
          </button>
        </div>
      </div>
    );
  }

  const title =
    gameData.kind === 'arena'
      ? gameData.game.title || 'Phòng thi đấu trực tuyến'
      : gameData.quizzi.title || 'Trò chơi tương tác Quizzi';
  const subject =
    gameData.kind === 'arena' ? gameData.game.subject : gameData.quizzi.subject;
  const grade =
    gameData.kind === 'arena' ? gameData.game.grade : gameData.quizzi.grade;
  const questionCount =
    gameData.kind === 'arena' ? (gameData.game.questions || []).length : undefined;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <GuestStudentEntryForm
        activityTypeLabel={
          gameData.kind === 'arena' ? 'Đấu Trường Trò Chơi Học Tập' : 'Trò Chơi Tương Tác Quizzi'
        }
        title={title}
        subject={subject}
        grade={grade}
        questionCount={questionCount}
        guestProfile={guestProfile}
        isStarted={isStarted}
        onStart={(profile) => {
          setGuestProfile(profile);
          setIsStarted(true);
          if (gameData.kind === 'quizzi') {
            try {
              const qId = String(gameData.quizzi.id);
              joinQuizLiveSession({
                targetId: qId,
                targetTitle: gameData.quizzi.title,
                subject: gameData.quizzi.subject,
                grade: gameData.quizzi.grade,
                studentId: profile.guestCode,
                studentName: `${profile.studentName} (${profile.classOrSchool})`,
                studentClass: profile.classOrSchool,
                totalQuestions: 1,
              });
              studentResultService.saveGameResult(profile.guestCode, qId, {
                score: 100,
                maxScore: 100,
                rank: 1,
                submittedAt: new Date().toISOString(),
                completed: true,
                questionsAnswered: 1,
                totalQuestions: 1,
                studentName: `${profile.studentName} (${profile.classOrSchool})`,
                className: profile.classOrSchool,
                roomId: qId,
                roomTitle: gameData.quizzi.title,
              });
            } catch (e) {
              console.warn('Could not log Quizzi guest participation:', e);
            }
          }
        }}
        onEditInfo={() => setIsStarted(false)}
        onGoHome={handleGoHome}
      />

      {isStarted && guestProfile && gameData.kind === 'arena' && (
        <div className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
          <InteractiveGamesModule
            key={`${gameData.game.id}_${guestProfile.guestCode}`}
            games={[gameData.game]}
            userRole="student"
            currentUserId={guestProfile.guestCode}
            currentUserName={`${guestProfile.studentName} (${guestProfile.classOrSchool})`}
            initialActiveGame={gameData.game}
          />
        </div>
      )}

      {isStarted && guestProfile && gameData.kind === 'quizzi' && (() => {
        const qItem = gameData.quizzi as any;
        const quizziExternalUrl: string = qItem.playUrl || qItem.url || qItem.link || '';
        return (
          <div className="flex-1 flex flex-col">
            {qItem.type === 'ai_html' && qItem.htmlContent ? (
              <iframe
                srcDoc={qItem.htmlContent}
                title={gameData.quizzi.title}
                className="flex-1 w-full border-0 min-h-[calc(100vh-64px)]"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            ) : quizziExternalUrl ? (
              <div className="flex-1 flex flex-col">
                <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 flex items-center justify-between">
                  <span>
                    💡 Nếu trò chơi không hiển thị trực tiếp bên dưới, em hãy bấm nút{' '}
                    <strong>Mở trong cửa sổ mới</strong> ở góc phải nhé.
                  </span>
                  <a
                    href={quizziExternalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700 transition inline-flex items-center gap-1 shrink-0 ml-2"
                  >
                    <ExternalLink size={12} /> Mở trong cửa sổ mới
                  </a>
                </div>
                <iframe
                  src={quizziExternalUrl}
                  title={gameData.quizzi.title}
                  className="flex-1 w-full border-0 min-h-[calc(100vh-100px)] bg-white"
                  allow="fullscreen; autoplay; clipboard-write"
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <Play size={48} className="text-indigo-500 mb-3" />
                <p className="text-slate-600 font-medium">
                  Trò chơi này chưa có đường dẫn nội dung.
                </p>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};
