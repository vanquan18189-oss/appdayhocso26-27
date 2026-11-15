import React, { useEffect, useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { extractExamIdFromPath } from '../services/examStorageService';
import { extractAssignmentIdFromPath } from '../services/assignmentStorageService';
import { extractGameIdFromPath } from '../services/gameStorageService';
import {
  PublicExamPlayerView,
  PublicAssignmentPlayerView,
} from './modules/PublicExamAssignmentPlayerView';
import { PublicGamePlayerView } from './modules/PublicGamePlayerView';

interface PublicRouteGateProps {
  children: React.ReactNode;
}

/**
 * Tầng router khởi tạo kiểm tra window.location.pathname trước khi render màn hình CỔNG HỌC SINH / CỔNG GIÁO VIÊN.
 * Hễ đường dẫn có dạng /exam/[id], /assignment/[id] hoặc /game/[id], mở thẳng giao diện làm bài / chơi trò chơi tự luyện tương ứng.
 */
export const PublicRouteGate: React.FC<PublicRouteGateProps> = ({ children }) => {
  const [publicExamId, setPublicExamId] = useState<string | null>(() =>
    extractExamIdFromPath()
  );
  const [publicAssignmentId, setPublicAssignmentId] = useState<string | null>(() =>
    extractAssignmentIdFromPath()
  );
  const [publicGameId, setPublicGameId] = useState<string | null>(() =>
    extractGameIdFromPath()
  );

  useEffect(() => {
    const handlePopState = () => {
      setPublicExamId(extractExamIdFromPath());
      setPublicAssignmentId(extractAssignmentIdFromPath());
      setPublicGameId(extractGameIdFromPath());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleExitPublicRoute = () => {
    if (typeof window !== 'undefined') {
      try {
        window.history.pushState({}, '', '/');
      } catch {
        // Ignore history pushState errors in restricted environments
      }
    }
    setPublicExamId(null);
    setPublicAssignmentId(null);
    setPublicGameId(null);
  };

  if (publicExamId) {
    return (
      <ErrorBoundary fallbackTitle="Không thể mở đề kiểm tra công khai">
        <PublicExamPlayerView
          examId={publicExamId}
          onGoHome={handleExitPublicRoute}
        />
      </ErrorBoundary>
    );
  }

  if (publicAssignmentId) {
    return (
      <ErrorBoundary fallbackTitle="Không thể mở bài tập công khai">
        <PublicAssignmentPlayerView
          assignmentId={publicAssignmentId}
          onGoHome={handleExitPublicRoute}
        />
      </ErrorBoundary>
    );
  }

  if (publicGameId) {
    return (
      <ErrorBoundary fallbackTitle="Không thể mở trò chơi học tập công khai">
        <PublicGamePlayerView
          gameId={publicGameId}
          onGoHome={handleExitPublicRoute}
        />
      </ErrorBoundary>
    );
  }

  return <>{children}</>;
};
