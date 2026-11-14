import React, { useEffect, useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { extractExamIdFromPath } from '../services/examStorageService';
import { extractAssignmentIdFromPath } from '../services/assignmentStorageService';
import {
  PublicExamPlayerView,
  PublicAssignmentPlayerView,
} from './modules/PublicExamAssignmentPlayerView';

interface PublicRouteGateProps {
  children: React.ReactNode;
}

/**
 * Tầng router khởi tạo kiểm tra window.location.pathname trước khi render màn hình CỔNG HỌC SINH / CỔNG GIÁO VIÊN.
 * Hễ đường dẫn có dạng /exam/[id] hoặc /assignment/[id], mở thẳng giao diện làm bài công khai tương ứng.
 */
export const PublicRouteGate: React.FC<PublicRouteGateProps> = ({ children }) => {
  const [publicExamId, setPublicExamId] = useState<string | null>(() =>
    extractExamIdFromPath()
  );
  const [publicAssignmentId, setPublicAssignmentId] = useState<string | null>(() =>
    extractAssignmentIdFromPath()
  );

  useEffect(() => {
    const handlePopState = () => {
      setPublicExamId(extractExamIdFromPath());
      setPublicAssignmentId(extractAssignmentIdFromPath());
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

  return <>{children}</>;
};
