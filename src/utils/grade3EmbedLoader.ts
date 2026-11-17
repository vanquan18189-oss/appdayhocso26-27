export interface Grade3EmbedOptions {
  baseUrl: string;
  targetModuleId: 'lesson_5e' | 'assignment' | 'question_bank' | 'interactive_games';
  teacherEmail: string;
  teacherName: string;
  teacherRole: string;
}

/**
 * Tải HTML của ứng dụng chuyên biệt Khối 3 (https://dayhockhoi3.vercel.app) và tiêm
 * bộ định tuyến tự động mở đúng phân hệ mục tiêu (VD: 'assignment' cho Quản lý Bài tập,
 * 'lesson_5e' cho Bài giảng) kèm phiên đăng nhập SSO độc lập.
 */
export async function buildGrade3EmbeddedSrcDoc(
  options: Grade3EmbedOptions
): Promise<string | null> {
  const cleanBase = /^https?:\/\//i.test(options.baseUrl.trim())
    ? options.baseUrl.trim().replace(/\/+$/, '')
    : `https://${options.baseUrl.trim().replace(/\/+$/, '')}`;

  try {
    const response = await fetch(`${cleanBase}/`, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache',
    });

    if (!response.ok) {
      return null;
    }

    let html = await response.text();
    if (!html || !html.includes('<head>')) {
      return null;
    }

    // Chuyển các đường dẫn tương đối /assets/... thành tuyệt đối tới ứng dụng Khối 3
    html = html
      .replace(/(src|href)=["']\/assets\//g, `$1="${cleanBase}/assets/`)
      .replace(/(src|href)=["']\.\/assets\//g, `$1="${cleanBase}/assets/`);

    const targetNavButtonId = `sidebar-item-${options.targetModuleId}`;
    const safeEmail = JSON.stringify(options.teacherEmail || 'thuthuthtk@gmail.com');
    const safeName = JSON.stringify(options.teacherName || 'Giáo viên');
    const safeRole = JSON.stringify(
      options.teacherRole === 'admin' ? 'admin' : 'teacher'
    );
    const safeTargetBtnId = JSON.stringify(targetNavButtonId);

    const injectedHeadBlock = `
    <base href="${cleanBase}/" />
    <style id="k3-boot-style">
      #root { opacity: 0 !important; transition: opacity 0.12s ease-in-out; }
    </style>
    <script>
      (function() {
        try {
          // Cô lập vùng nhớ localStorage của App con Khối 3 để không trộn dữ liệu với App Mẹ
          var rawStorage = window.localStorage;
          var K3_PREFIX = 'k3_isolated_';
          var SHARED_PASSTHROUGH_KEYS = {
            eduplay_gemini_api_key: true
          };
          var isolatedStorage = {
            getItem: function(key) {
              var k = SHARED_PASSTHROUGH_KEYS[key] ? key : K3_PREFIX + key;
              return rawStorage.getItem(k);
            },
            setItem: function(key, val) {
              var k = SHARED_PASSTHROUGH_KEYS[key] ? key : K3_PREFIX + key;
              return rawStorage.setItem(k, String(val));
            },
            removeItem: function(key) {
              var k = SHARED_PASSTHROUGH_KEYS[key] ? key : K3_PREFIX + key;
              return rawStorage.removeItem(k);
            },
            clear: function() {
              var keysToRemove = [];
              for (var i = 0; i < rawStorage.length; i++) {
                var k = rawStorage.key(i);
                if (k && k.indexOf(K3_PREFIX) === 0) keysToRemove.push(k);
              }
              keysToRemove.forEach(function(k) { rawStorage.removeItem(k); });
            },
            key: function(index) {
              return rawStorage.key(index);
            },
            get length() {
              return rawStorage.length;
            }
          };
          Object.defineProperty(window, 'localStorage', {
            value: isolatedStorage,
            configurable: true,
            enumerable: true
          });

          // Thiết lập sẵn thông tin giáo viên đăng nhập SSO cho App con Khối 3
          window.localStorage.setItem('eduplay_teacher_email', ${safeEmail});
          window.localStorage.setItem('eduplay_teacher_name', ${safeName});
          window.localStorage.setItem('eduplay_active_role', ${safeRole});
        } catch (err) {
          console.warn('K3 storage isolation warning:', err);
        }

        // Bọc an toàn history.pushState / replaceState trong ngữ cảnh srcdoc
        try {
          var origReplace = window.history.replaceState;
          var origPush = window.history.pushState;
          window.history.replaceState = function() {
            try { return origReplace.apply(this, arguments); } catch (e) {}
          };
          window.history.pushState = function() {
            try { return origPush.apply(this, arguments); } catch (e) {}
          };
        } catch (e) {}

        // Tự động chuyển ngay sang tab mục tiêu (VD: sidebar-item-assignment) ngay khi React mount
        var targetBtnId = ${safeTargetBtnId};
        var activated = false;

        function revealRoot() {
          var styleEl = document.getElementById('k3-boot-style');
          if (styleEl && styleEl.parentNode) {
            styleEl.parentNode.removeChild(styleEl);
          }
        }

        function trySelectTargetModule() {
          if (activated) return true;
          var btn = document.getElementById(targetBtnId);
          if (btn) {
            activated = true;
            btn.click();
            requestAnimationFrame(function() {
              revealRoot();
            });
            return true;
          }
          return false;
        }

        var observer = new MutationObserver(function() {
          if (trySelectTargetModule()) {
            observer.disconnect();
          }
        });

        observer.observe(document.documentElement, {
          childList: true,
          subtree: true
        });

        var pollTimer = setInterval(function() {
          if (trySelectTargetModule()) {
            clearInterval(pollTimer);
          }
        }, 16);

        setTimeout(function() {
          clearInterval(pollTimer);
          observer.disconnect();
          revealRoot();
        }, 2500);
      })();
    </script>`;

    return html.replace('<head>', `<head>${injectedHeadBlock}`);
  } catch (err) {
    console.warn('Không thể tải trực tiếp HTML ứng dụng Khối 3 để tiêm định tuyến:', err);
    return null;
  }
}
