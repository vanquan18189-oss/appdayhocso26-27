import React, { createContext, useContext, useState } from 'react';

interface AcademicYearContextType {
  selectedAcademicYear: string;
  setSelectedAcademicYear: (year: string) => void;
  selectedSemester: string;
  setSelectedSemester: (semester: string) => void;
  activeAcademicYear: string;
  availableYears: string[];
  hasYearEnrollments: boolean;
}

const DEFAULT_YEAR = '2026-2027';
const DEFAULT_SEMESTER = 'Học kỳ I';
const AVAILABLE_YEARS = ['2026-2027', '2027-2028'];

const AcademicYearContext = createContext<AcademicYearContextType>({
  selectedAcademicYear: DEFAULT_YEAR,
  setSelectedAcademicYear: () => {},
  selectedSemester: DEFAULT_SEMESTER,
  setSelectedSemester: () => {},
  activeAcademicYear: DEFAULT_YEAR,
  availableYears: AVAILABLE_YEARS,
  hasYearEnrollments: true,
});

export const AcademicYearProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedAcademicYear, setSelectedAcademicYearState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('eduplay_selected_academic_year');
        if (saved && AVAILABLE_YEARS.includes(saved)) return saved;
      } catch {}
    }
    return DEFAULT_YEAR;
  });

  const [selectedSemester, setSelectedSemesterState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('eduplay_selected_semester');
        if (saved) return saved;
      } catch {}
    }
    return DEFAULT_SEMESTER;
  });

  const setSelectedAcademicYear = (year: string) => {
    const validYear = year === '2027-2028' ? DEFAULT_YEAR : year;
    setSelectedAcademicYearState(validYear);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('eduplay_selected_academic_year', validYear);
        window.dispatchEvent(new CustomEvent('eduplay_academic_year_changed', { detail: { year: validYear } }));
      } catch {}
    }
  };

  const setSelectedSemester = (semester: string) => {
    setSelectedSemesterState(semester);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('eduplay_selected_semester', semester);
        window.dispatchEvent(new CustomEvent('eduplay_academic_semester_changed', { detail: { semester } }));
      } catch {}
    }
  };

  return (
    <AcademicYearContext.Provider
      value={{
        selectedAcademicYear,
        setSelectedAcademicYear,
        selectedSemester,
        setSelectedSemester,
        activeAcademicYear: DEFAULT_YEAR,
        availableYears: AVAILABLE_YEARS,
        hasYearEnrollments: true,
      }}
    >
      {children}
    </AcademicYearContext.Provider>
  );
};

export const useAcademicYear = () => useContext(AcademicYearContext);
