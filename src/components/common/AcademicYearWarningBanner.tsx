import React from 'react';

export interface AcademicYearBannerProps {
  academicYear?: string;
  title?: string;
  description?: string;
  onGoToPromotion?: () => void;
}

export const AcademicYearWarningBanner: React.FC<AcademicYearBannerProps> = () => null;
export const AcademicYearEmptyState: React.FC<AcademicYearBannerProps> = () => null;
