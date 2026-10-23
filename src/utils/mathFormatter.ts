/**
 * Chuẩn hóa và làm sạch văn bản câu hỏi, đáp án, giải thích môn Toán
 * Loại bỏ ký tự $ bao quanh, chuyển đổi toàn bộ mã lệnh LaTeX thô (\dots, \frac, \times...) thành ký hiệu sư phạm tiểu học chuẩn.
 */
export function cleanMathFormatting(text?: string | null): string {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text;

  // 1. Chuyển đổi các dấu chấm / điền khuyết LaTeX (\dots, \ldots, \cdots, \vdots, \ddots)
  cleaned = cleaned.replace(/\\(dots|ldots|cdots|vdots|ddots)\b/g, '...');

  // 2. Chuyển đổi phân số LaTeX \frac{a}{b}, \dfrac{a}{b}, \tfrac{a}{b} -> a/b
  cleaned = cleaned
    .replace(/\\(frac|dfrac|tfrac)\{([^}]+)\}\{([^}]+)\}/g, '$2/$3')
    .replace(/\\sqrt\[([^}]+)\]\{([^}]+)\}/g, '√($2)')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)');

  // 3. Chuyển đổi các ký hiệu phép tính và so sánh LaTeX sang chuẩn sư phạm tiểu học
  cleaned = cleaned
    // Ký hiệu nhân \times, \cdot, \bullet -> ×
    .replace(/\\(times|cdot|bullet)\b/g, '×')
    // Ký hiệu chia \div, \colon -> :
    .replace(/\\(div|colon)\b/g, ':')
    // So sánh \leq, \le -> ≤
    .replace(/\\(leq|le)\b/g, '≤')
    // So sánh \geq, \ge -> ≥
    .replace(/\\(geq|ge)\b/g, '≥')
    // Khác \neq, \ne -> ≠
    .replace(/\\(neq|ne)\b/g, '≠')
    // Xấp xỉ \approx, \simeq -> ≈
    .replace(/\\(approx|simeq)\b/g, '≈')
    // Cộng trừ \pm -> ±
    .replace(/\\pm\b/g, '±')
    // Độ \degree -> °
    .replace(/\\degree|\^\s*\\circ|\^circ/g, '°')
    // Góc \angle -> ∠, Tam giác \triangle -> △
    .replace(/\\angle\b/g, '∠')
    .replace(/\\triangle\b/g, '△')
    // Song song \parallel -> ∥, Vuông góc \perp -> ⊥
    .replace(/\\parallel\b/g, '∥')
    .replace(/\\perp\b/g, '⊥')
    // Tập hợp \in -> ∈, \notin -> ∉
    .replace(/\\in\b/g, '∈')
    .replace(/\\notin\b/g, '∉');

  // 4. Bóc tách các thẻ font/định dạng LaTeX \text{...}, \mathrm{...}, \mathbf{...}, \mathit{...}, \underline{...}, \overline{...}
  cleaned = cleaned.replace(/\\(mathrm|mathbf|text|mathit|mathsf|mathtt|underline|overline|hat|vec)\{([^}]+)\}/g, '$2');

  // 5. Chuyển đổi khoảng trắng LaTeX (\,, \;, \:, \!, \quad, \qquad, \ ) -> khoảng trắng đơn
  cleaned = cleaned.replace(/\\(quad|qquad|,|;|:|!|\s)/g, ' ');

  // 6. Xử lý các ký tự escape backslash trong LaTeX (\%, \$, \_, \{, \})
  cleaned = cleaned
    .replace(/\\%/g, '%')
    .replace(/\\\$/g, '$')
    .replace(/\\_/g, '_')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}');

  // 7. Loại bỏ khối LaTeX math delimiters \[ ... \] và \( ... \)
  cleaned = cleaned
    .replace(/\\\[([\s\S]*?)\\\]/g, '$1')
    .replace(/\\\(([\s\S]*?)\\\)/g, '$1');

  // 8. Loại bỏ ký hiệu đô la bao quanh biểu thức toán ($...$ hoặc $$...$$)
  cleaned = cleaned.replace(/\$\$([\s\S]*?)\$\$/g, '$1');
  cleaned = cleaned.replace(/\$([^$\n]+?)\$/g, '$1');

  // 9. Nếu còn ký hiệu $ đơn lẻ dính vào biểu thức số hoặc phép tính (như "700$." hoặc "$400")
  cleaned = cleaned.replace(/(\d+[\d\s+\-×÷:=./()]+)\$/g, '$1');
  cleaned = cleaned.replace(/\$(\d+[\d\s+\-×÷:=./()]+)/g, '$1');

  // 10. Loại bỏ bất kỳ lệnh backslash đơn lẻ nào chưa xử lý còn sót lại (ví dụ \something -> something)
  cleaned = cleaned.replace(/\\([a-zA-Z]+)/g, '$1');

  // 11. Chuẩn hóa khoảng trắng dư thừa
  cleaned = cleaned
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();

  return cleaned;
}

/**
 * Làm sạch toàn bộ thuộc tính của một đối tượng câu hỏi
 */
export function cleanQuestionMath<T extends Record<string, any>>(q: T): T {
  if (!q || typeof q !== 'object') return q;

  const newQ: any = { ...q };

  if (typeof newQ.content === 'string') {
    newQ.content = cleanMathFormatting(newQ.content);
  }

  if (typeof newQ.explanation === 'string') {
    newQ.explanation = cleanMathFormatting(newQ.explanation);
  }

  if (typeof newQ.correctAnswer === 'string') {
    newQ.correctAnswer = cleanMathFormatting(newQ.correctAnswer);
  }

  if (Array.isArray(newQ.options)) {
    newQ.options = newQ.options.map((opt: any) =>
      typeof opt === 'string' ? cleanMathFormatting(opt) : opt
    );
  }

  if (Array.isArray(newQ.statements)) {
    newQ.statements = newQ.statements.map((st: any) => {
      if (st && typeof st === 'object') {
        return {
          ...st,
          statement: typeof st.statement === 'string' ? cleanMathFormatting(st.statement) : st.statement,
          explanation: typeof st.explanation === 'string' ? cleanMathFormatting(st.explanation) : st.explanation
        };
      }
      return st;
    });
  }

  if (Array.isArray(newQ.matchingPairs)) {
    newQ.matchingPairs = newQ.matchingPairs.map((pair: any) => {
      if (pair && typeof pair === 'object') {
        return {
          ...pair,
          left: typeof pair.left === 'string' ? cleanMathFormatting(pair.left) : pair.left,
          right: typeof pair.right === 'string' ? cleanMathFormatting(pair.right) : pair.right
        };
      }
      return pair;
    });
  }

  if (Array.isArray(newQ.classificationItems)) {
    newQ.classificationItems = newQ.classificationItems.map((item: any) => {
      if (item && typeof item === 'object') {
        return {
          ...item,
          text: typeof item.text === 'string' ? cleanMathFormatting(item.text) : item.text
        };
      }
      return item;
    });
  }

  return newQ;
}
