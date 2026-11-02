export function splitVietnameseName(fullName: string): { firstName: string; middleName: string } {
  const clean = (fullName || '').trim().replace(/\s+/g, ' ');
  if (!clean) return { firstName: '', middleName: '' };
  const parts = clean.split(' ');
  const firstName = parts[parts.length - 1];
  const middleName = parts.slice(0, parts.length - 1).join(' ');
  return { firstName, middleName };
}

const vietnameseCollator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });

export function compareVietnameseNames(nameA: string, nameB: string): number {
  const a = splitVietnameseName(nameA);
  const b = splitVietnameseName(nameB);
  
  // 1. Compare first name (TÊN)
  const cmpFirst = vietnameseCollator.compare(a.firstName, b.firstName);
  if (cmpFirst !== 0) return cmpFirst;

  // 2. Compare middle name (Họ đệm)
  const cmpMiddle = vietnameseCollator.compare(a.middleName, b.middleName);
  if (cmpMiddle !== 0) return cmpMiddle;

  return 0;
}

export function getStudentFullName(st: { name?: string; fullName?: string; lastName?: string; firstName?: string }): string {
  if (st.name) return st.name;
  if (st.fullName) return st.fullName;
  if (st.lastName || st.firstName) {
    return `${st.lastName || ''} ${st.firstName || ''}`.trim();
  }
  return '';
}

export function sortStudentsByName<T extends { name?: string; fullName?: string; lastName?: string; firstName?: string; code?: string; id?: string; studentCode?: string }>(
  students: T[],
  direction: 'asc' | 'desc' = 'asc'
): T[] {
  return [...students].sort((s1, s2) => {
    const n1 = getStudentFullName(s1);
    const n2 = getStudentFullName(s2);
    const cmp = compareVietnameseNames(n1, n2);
    if (cmp !== 0) {
      return direction === 'asc' ? cmp : -cmp;
    }
    // Fallback to code / studentCode / id
    const code1 = s1.code || s1.studentCode || s1.id || '';
    const code2 = s2.code || s2.studentCode || s2.id || '';
    const cmpCode = vietnameseCollator.compare(code1, code2);
    return direction === 'asc' ? cmpCode : -cmpCode;
  });
}
