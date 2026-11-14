import React, { useEffect, useState } from 'react';
import {
  extractPublicRouteFromPath,
  ParsedPublicRoute,
} from '../services/publicGuestService';
import { PublicExamPlayerView } from './modules/PublicExamPlayerView';
import { PublicAssignmentPlayerView } from './modules/PublicAssignmentPlayerView';
import { PublicLessonPlayerView } from './modules/PublicLessonPlayerView';
import { PublicGamePlayerView } from './modules/PublicGamePlayerView';

interface PublicGuestRouterProps {
  children: React.ReactNode;
}

export const PublicGuestRouter: React.FC<PublicGuestRouterProps> = ({ children }) => {
  const [routeMatch, setRouteMatch] = useState<ParsedPublicRoute | null>(() =>
    extractPublicRouteFromPath()
  );

  useEffect(() => {
    const syncRoute = () => {
      setRouteMatch(extractPublicRouteFromPath());
    };
    window.addEventListener('popstate', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
    };
  }, []);

  const handleGoHome = () => {
    try {
      window.history.pushState({}, '', '/');
    } catch {}
    setRouteMatch(null);
  };

  if (routeMatch) {
    if (routeMatch.type === 'exam') {
      return <PublicExamPlayerView examId={routeMatch.id} onGoHome={handleGoHome} />;
    }
    if (routeMatch.type === 'assignment') {
      return <PublicAssignmentPlayerView assignmentId={routeMatch.id} onGoHome={handleGoHome} />;
    }
    if (routeMatch.type === 'lesson') {
      return <PublicLessonPlayerView lessonId={routeMatch.id} onGoHome={handleGoHome} />;
    }
    if (routeMatch.type === 'game') {
      return <PublicGamePlayerView gameId={routeMatch.id} onGoHome={handleGoHome} />;
    }
  }

  return <>{children}</>;
};
