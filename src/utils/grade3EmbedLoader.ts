export interface Grade3EmbedOptions {
  baseUrl: string;
  targetModuleId: 'lesson_5e' | 'assignment' | 'question_bank' | 'interactive_games';
  teacherEmail: string;
  teacherName: string;
  teacherRole: string;
  ssoToken?: string;
}

/**
 * Tải HTML của ứng dụng chuyên biệt Khối 3 (https://dayhockhoi3.vercel.app) và tiêm:
 * 1. Phiên xác thực SSO tự động (Email, Tên giáo viên, Vai trò, Token, autologin=true)
 * 2. Cơ chế tự động bỏ qua màn hình chọn Cổng đăng nhập (Cổng Học Sinh / Cổng Giáo Viên)
 *    thông qua cả URL Params, postMessage, localStorage/sessionStorage và React Fiber Portal Bypass.
 * 3. Bộ định tuyến tự động mở thẳng phân hệ mục tiêu (VD: 'assignment' cho Quản lý Bài tập).
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
    const resolvedEmail = (options.teacherEmail || 'thuthuthtk@gmail.com').trim().toLowerCase();
    const resolvedName = (options.teacherName || 'Giáo viên').trim();
    const resolvedRole =
      options.teacherRole === 'admin' ||
      resolvedEmail === 'thuthuthtk@gmail.com' ||
      resolvedEmail === 'vanquan18189@gmail.com'
        ? 'admin'
        : 'teacher';
    const resolvedToken = options.ssoToken || '';

    const safeEmail = JSON.stringify(resolvedEmail);
    const safeName = JSON.stringify(resolvedName);
    const safeRole = JSON.stringify(resolvedRole);
    const safeToken = JSON.stringify(resolvedToken);
    const safeTargetModule = JSON.stringify(options.targetModuleId);
    const safeTargetBtnId = JSON.stringify(targetNavButtonId);

    const injectedHeadBlock = `
    <base href="${cleanBase}/" />
    <style id="k3-boot-style">
      #root { opacity: 0 !important; transition: opacity 0.12s ease-in-out; }
    </style>
    <script>
      (function() {
        var ssoEmail = ${safeEmail};
        var ssoName = ${safeName};
        var ssoRole = ${safeRole};
        var ssoToken = ${safeToken};
        var targetModuleId = ${safeTargetModule};
        var targetBtnId = ${safeTargetBtnId};
        var explicitLogoutTriggered = false;

        try {
          // 1. Cô lập vùng nhớ localStorage của App con Khối 3 và bảo vệ khóa phiên đăng nhập SSO giáo viên
          var rawStorage = window.localStorage;
          var K3_PREFIX = 'k3_isolated_';
          var SHARED_PASSTHROUGH_KEYS = {
            eduplay_gemini_api_key: true
          };
          var PROTECTED_SSO_KEYS = {
            eduplay_sso_authenticated: 'true',
            eduplay_teacher_email: ssoEmail,
            eduplay_teacher_name: ssoName,
            eduplay_user_role: ssoRole,
            eduplay_active_role: ssoRole,
            user_email: ssoEmail
          };

          var ssoSessionObj = JSON.stringify({
            id: ssoEmail,
            uid: ssoEmail,
            email: ssoEmail,
            name: ssoName,
            displayName: ssoName,
            role: ssoRole,
            userRole: ssoRole,
            targetModule: targetModuleId,
            rawTab: targetModuleId,
            autologin: true,
            auto_login: true,
            source: 'PK_TRUC_KHANG_LMS',
            loggedInAt: new Date().toISOString()
          });

          var isolatedStorage = {
            getItem: function(key) {
              if (!explicitLogoutTriggered && Object.prototype.hasOwnProperty.call(PROTECTED_SSO_KEYS, key)) {
                var storedVal = rawStorage.getItem(K3_PREFIX + key);
                return storedVal || PROTECTED_SSO_KEYS[key];
              }
              var k = SHARED_PASSTHROUGH_KEYS[key] ? key : K3_PREFIX + key;
              return rawStorage.getItem(k);
            },
            setItem: function(key, val) {
              var k = SHARED_PASSTHROUGH_KEYS[key] ? key : K3_PREFIX + key;
              return rawStorage.setItem(k, String(val));
            },
            removeItem: function(key) {
              // Ngăn onAuthStateChanged(null) của Firebase xóa mất email giáo viên vừa đăng nhập SSO
              if (!explicitLogoutTriggered && Object.prototype.hasOwnProperty.call(PROTECTED_SSO_KEYS, key)) {
                return;
              }
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

          window.localStorage.setItem('eduplay_sso_authenticated', 'true');
          window.localStorage.setItem('eduplay_teacher_email', ssoEmail);
          window.localStorage.setItem('eduplay_teacher_name', ssoName);
          window.localStorage.setItem('eduplay_user_role', ssoRole);
          window.localStorage.setItem('eduplay_active_role', ssoRole);
          window.localStorage.setItem('eduplay_sso_session', ssoSessionObj);
          window.localStorage.setItem('khls_current_user', ssoSessionObj);
          window.localStorage.removeItem('eduplay_student_session');

          try {
            window.sessionStorage.setItem('eduplay_sso_authenticated', 'true');
            window.sessionStorage.setItem('eduplay_sso_session', ssoSessionObj);
            window.sessionStorage.setItem('eduplay_teacher_email', ssoEmail);
            window.sessionStorage.setItem('eduplay_teacher_name', ssoName);
            window.sessionStorage.setItem('eduplay_user_role', ssoRole);
          } catch (e) {}

          window.addEventListener('eduplay_logout', function() {
            explicitLogoutTriggered = true;
          });
        } catch (err) {
          console.warn('K3 storage isolation warning:', err);
        }

        // 2. Bọc an toàn history.pushState / replaceState trong ngữ cảnh srcdoc
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

        // 3. Tự động bỏ qua màn hình chọn cổng đăng nhập (Cổng Học Sinh / Cổng Giáo Viên)
        //    bằng cách kích hoạt trực tiếp callback onSelectPortal trên cây React Fiber của #root
        var portalBypassed = false;
        var moduleActivated = false;

        function revealRoot() {
          var styleEl = document.getElementById('k3-boot-style');
          if (styleEl && styleEl.parentNode) {
            styleEl.parentNode.removeChild(styleEl);
          }
        }

        function findFiberWithOnSelectPortal(rootNode) {
          if (!rootNode) return null;
          var visited = new Set();
          var queue = [rootNode];
          var steps = 0;

          while (queue.length > 0 && steps < 600) {
            steps++;
            var fiber = queue.shift();
            if (!fiber || visited.has(fiber)) continue;
            visited.add(fiber);

            try {
              var props = fiber.memoizedProps || fiber.pendingProps;
              if (props && typeof props.onSelectPortal === 'function') {
                return props.onSelectPortal;
              }
            } catch (e) {}

            if (fiber.child) queue.push(fiber.child);
            if (fiber.sibling) queue.push(fiber.sibling);
            if (fiber.alternate) queue.push(fiber.alternate);
            if (fiber.return && steps < 40) queue.push(fiber.return);
          }
          return null;
        }

        function tryBypassPortalViaReactFiber() {
          if (portalBypassed || explicitLogoutTriggered) return true;
          var rootEl = document.getElementById('root');
          if (!rootEl) return false;

          // Nếu thanh điều hướng chính đã xuất hiện thì nghĩa là đã vượt qua màn hình đăng nhập
          if (document.getElementById('sidebar-navigation') || document.getElementById(targetBtnId)) {
            portalBypassed = true;
            return true;
          }

          var startingFibers = [];
          try {
            var rootKeys = Object.keys(rootEl);
            for (var i = 0; i < rootKeys.length; i++) {
              var rk = rootKeys[i];
              if (rk.indexOf('__reactContainer$') === 0 || rk.indexOf('__reactFiber$') === 0) {
                startingFibers.push(rootEl[rk]);
              }
            }
            var firstChild = rootEl.firstElementChild;
            if (firstChild) {
              var childKeys = Object.keys(firstChild);
              for (var j = 0; j < childKeys.length; j++) {
                var ck = childKeys[j];
                if (ck.indexOf('__reactFiber$') === 0 || ck.indexOf('__reactContainer$') === 0) {
                  startingFibers.push(firstChild[ck]);
                }
              }
            }
          } catch (e) {}

          for (var fIdx = 0; fIdx < startingFibers.length; fIdx++) {
            var onSelectPortalFn = findFiberWithOnSelectPortal(startingFibers[fIdx]);
            if (typeof onSelectPortalFn === 'function') {
              portalBypassed = true;
              try {
                onSelectPortalFn(ssoRole, 'Khối 3', 'Lớp 3A', {
                  email: ssoEmail,
                  name: ssoName
                });
              } catch (err) {
                console.warn('K3 SSO direct portal bypass notice:', err);
              }
              return true;
            }
          }
          return false;
        }

        function syncTeacherIdentityEvents() {
          try {
            window.localStorage.setItem('eduplay_teacher_email', ssoEmail);
            window.localStorage.setItem('eduplay_teacher_name', ssoName);
            window.dispatchEvent(
              new CustomEvent('eduplay_teachers_updated', {
                detail: {
                  teachers: [
                    {
                      id: 'sso-teacher',
                      name: ssoName,
                      email: ssoEmail,
                      role: ssoRole === 'admin' ? 'Quản trị viên (ADMIN)' : 'Giáo viên',
                      userRole: ssoRole,
                      toChuyenMon: 'Tổ 3',
                      subject: 'Tin học & Công nghệ',
                      avatar: '👩‍🏫',
                      teachingClasses: ['Lớp 3A', 'Lớp 3B', 'Lớp 3C', 'Lớp 3D']
                    }
                  ]
                }
              })
            );
            window.postMessage(
              {
                type: 'PK_TRUC_KHANG_SSO_LOGIN',
                autologin: true,
                email: ssoEmail,
                name: ssoName,
                role: ssoRole,
                token: ssoToken,
                ssoToken: ssoToken,
                tab: targetModuleId,
                module: targetModuleId,
                user: {
                  email: ssoEmail,
                  name: ssoName,
                  displayName: ssoName,
                  role: ssoRole,
                  uid: ssoEmail
                }
              },
              '*'
            );
          } catch (e) {}
        }

        function trySelectTargetModule() {
          if (explicitLogoutTriggered) return true;
          tryBypassPortalViaReactFiber();

          if (moduleActivated) return true;
          var btn = document.getElementById(targetBtnId);
          if (btn) {
            moduleActivated = true;
            btn.click();
            syncTeacherIdentityEvents();
            requestAnimationFrame(function() {
              revealRoot();
            });
            // Đồng bộ lại thông tin giáo viên sau khi onAuthStateChanged của Firebase chạy xong
            setTimeout(syncTeacherIdentityEvents, 180);
            setTimeout(syncTeacherIdentityEvents, 600);
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
          syncTeacherIdentityEvents();
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
