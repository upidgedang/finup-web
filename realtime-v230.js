/*
 * FinUp v2.3.9 - Firestore + Realtime Database hybrid synchronization layer.
 *
 * This file intentionally wraps the existing v2.1.x REST synchronizer so the
 * application can fall back to the previous behaviour when the Firebase SDK
 * cannot be loaded. Normal v2.3.0 operation uses Firestore snapshot listeners,
 * a lightweight Realtime Database signal channel, server timestamps, soft
 * deletion, offline persistence, and three-way conflict detection.
 */
(function () {
    'use strict';

    var realtimeAvailable = false;
    var firebaseApp = null;
    var firebaseAuth = null;
    var firestoreDb = null;
    var realtimeListeners = [];
    var realtimeRenderTimer = null;
    var realtimeStartedUid = '';
    var realtimeInitialCollections = {};
    var realtimePendingWrites = 0;
    var realtimeLastError = '';
    var realtimeReady = false;
    var realtimeConnected = false;
    var realtimeSyncTimer = null;
    var REALTIME_RENDER_DELAY_V223 = 90;
    var REALTIME_SYNC_DELAY_V223 = 100;
    var LICENSE_REFRESH_INTERVAL_V223 = 6 * 60 * 60 * 1000;
    var firestorePersistenceReady = false;
    var deviceId = '';
    var CONFLICT_HISTORY_LIMIT_V236 = 100;
    var CONFLICT_DEDUPE_WINDOW_V236 = 24 * 60 * 60 * 1000;
    var syncPromise = null;
    var originalFunctions = {};
    var remoteBaselinesV223 = {};

    // Realtime Database is a very small notification channel. Business data
    // remains in Cloud Firestore. The URL matches a default RTDB created in
    // Singapore for the existing Firebase project.
    var RTDB_URL_V223 = String(config.databaseURL || 'https://finup-pribadi-a4ea7-default-rtdb.asia-southeast1.firebasedatabase.app').replace(/\/$/, '');
    var rtdbEventSource = null;
    var rtdbReconnectTimer = null;
    var rtdbSignalPullTimer = null;
    var rtdbStartedUid = '';
    var rtdbInitialEventSeen = false;
    var rtdbConnected = false;
    var rtdbLastNonce = '';
    var rtdbLastSignalAt = 0;
    var rtdbReconnectAttempts = 0;
    var RTDB_RECONNECT_DELAY_V223 = 5000;
    var RTDB_SIGNAL_PULL_DELAY_V223 = 120;

    var FIREBASE_V223_CONFIG = {
        apiKey: config.apiKey,
        authDomain: config.projectId + '.firebaseapp.com',
        projectId: config.projectId,
        storageBucket: config.storageBucket,
        databaseURL: RTDB_URL_V223,
        appId: '1:806156083470:android:4da5bda89944f249b3775f'
    };

    // Capture the v2.1.x functions explicitly. Avoid eval() so this layer also
    // works on WebViews with stricter JavaScript execution policies.
    originalFunctions.init = typeof init === 'function' ? init : null;
    originalFunctions.submitAuth = typeof submitAuth === 'function' ? submitAuth : null;
    originalFunctions.sendPasswordReset = typeof sendPasswordReset === 'function' ? sendPasswordReset : null;
    originalFunctions.sendVerification = typeof sendVerification === 'function' ? sendVerification : null;
    originalFunctions.refreshAccountInfo = typeof refreshAccountInfo === 'function' ? refreshAccountInfo : null;
    originalFunctions.ensureToken = typeof ensureToken === 'function' ? ensureToken : null;
    originalFunctions.enterApp = typeof enterApp === 'function' ? enterApp : null;
    originalFunctions.syncNow = typeof syncNow === 'function' ? syncNow : null;
    originalFunctions.queueSet = typeof queueSet === 'function' ? queueSet : null;
    originalFunctions.queueDelete = typeof queueDelete === 'function' ? queueDelete : null;
    originalFunctions.saveEntity = typeof saveEntity === 'function' ? saveEntity : null;
    originalFunctions.removeEntity = typeof removeEntity === 'function' ? removeEntity : null;
    originalFunctions.logout = typeof logout === 'function' ? logout : null;
    originalFunctions.deleteAccountAndData = typeof deleteAccountAndData === 'function' ? deleteAccountAndData : null;
    originalFunctions.updateSyncStatus = typeof updateSyncStatus === 'function' ? updateSyncStatus : null;

    function firebaseErrorMessage(error) {
        var code = String(error && error.code || '');
        var messageText = String(error && error.message || error || '');
        var map = {
            'auth/invalid-email': 'Alamat email tidak valid.',
            'auth/user-disabled': 'Akun ini telah dinonaktifkan.',
            'auth/user-not-found': 'Email atau kata sandi salah.',
            'auth/wrong-password': 'Email atau kata sandi salah.',
            'auth/invalid-credential': 'Email atau kata sandi salah.',
            'auth/email-already-in-use': 'Email tersebut sudah digunakan.',
            'auth/weak-password': 'Kata sandi terlalu lemah. Gunakan minimal 6 karakter.',
            'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi beberapa saat.',
            'auth/network-request-failed': 'Tidak dapat terhubung ke Firebase. Periksa internet dan waktu perangkat.',
            'auth/requires-recent-login': 'Silakan keluar dan masuk kembali sebelum melakukan tindakan ini.',
            'permission-denied': 'Akses Firestore ditolak. Periksa Firestore Rules.',
            'failed-precondition': 'Firestore belum siap pada perangkat ini.',
            'unavailable': 'Layanan Firebase sedang tidak tersedia. Perubahan tetap tersimpan di perangkat.',
            'resource-exhausted': 'Kuota Firebase sedang habis. Perubahan tetap tersimpan di perangkat.'
        };
        if (map[code]) return map[code];
        if (/permission/i.test(messageText)) return map['permission-denied'];
        if (/network|offline|fetch|unavailable/i.test(messageText)) return map['unavailable'];
        return messageText.replace(/^Firebase:\s*/i, '') || 'Terjadi kesalahan Firebase.';
    }

    function initFirebaseV221() {
        if (typeof window.firebase === 'undefined' || !window.firebase.initializeApp) {
            realtimeLastError = 'Firebase SDK tidak dapat dimuat. Sinkronisasi memakai mode kompatibilitas.';
            return false;
        }
        try {
            firebaseApp = window.firebase.apps && window.firebase.apps.length
                ? window.firebase.app()
                : window.firebase.initializeApp(FIREBASE_V223_CONFIG);
            firebaseAuth = window.firebase.auth();
            firestoreDb = window.firebase.firestore();

            try {
                firestoreDb.settings({
                    experimentalAutoDetectLongPolling: true,
                    useFetchStreams: false,
                    cacheSizeBytes: window.firebase.firestore.CACHE_SIZE_UNLIMITED
                });
            } catch (settingsError) {
                console.warn('Firestore settings already applied', settingsError);
            }

            try {
                Promise.resolve(firebaseAuth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL))
                    .catch(function (persistenceError) {
                        console.warn('Auth persistence setup failed', persistenceError);
                    });
            } catch (persistenceError) {
                console.warn('Auth persistence setup failed', persistenceError);
            }

            var persistenceCall = null;
            try {
                persistenceCall = firestoreDb.enablePersistence({ synchronizeTabs: true });
            } catch (persistenceSyncError) {
                persistenceCall = Promise.reject(persistenceSyncError);
            }
            Promise.resolve(persistenceCall).then(function () {
                firestorePersistenceReady = true;
            }).catch(function (error) {
                var code = String(error && error.code || '');
                if (code !== 'failed-precondition' && code !== 'unimplemented') {
                    console.warn('Firestore offline persistence unavailable', error);
                }
                firestorePersistenceReady = code === 'failed-precondition';
            });

            realtimeAvailable = true;
            return true;
        } catch (error) {
            realtimeLastError = firebaseErrorMessage(error);
            console.error('Firebase v2.3.0 initialization failed', error);
            return false;
        }
    }

    function getDeviceIdV221() {
        if (deviceId) return deviceId;
        var key = 'finup_device_id_v221';
        deviceId = localStorage.getItem(key) || '';
        if (!deviceId) {
            deviceId = 'android-' + rid() + '-' + Math.random().toString(36).slice(2, 8);
            localStorage.setItem(key, deviceId);
        }
        return deviceId;
    }

    function currentFirebaseUser() {
        return firebaseAuth && firebaseAuth.currentUser ? firebaseAuth.currentUser : null;
    }

    function makeSessionFromUser(user, token) {
        return {
            localId: user.uid,
            email: user.email || '',
            emailVerified: !!user.emailVerified,
            idToken: token || '',
            expiresAt: Date.now() + 50 * 60 * 1000,
            authProvider: 'firebase-sdk-v223'
        };
    }

    function saveFirebaseSession(user, token) {
        session = makeSessionFromUser(user, token);
        saveJson(KSES, session);
        return session;
    }

    function timestampToIso(value) {
        if (!value) return value;
        if (typeof value.toDate === 'function') {
            try { return value.toDate().toISOString(); } catch (ignore) { return value; }
        }
        return value;
    }

    function normalizeFirestoreValue(value) {
        if (value === null || value === undefined) return value;
        if (typeof value.toDate === 'function') return timestampToIso(value);
        if (Array.isArray(value)) return value.map(normalizeFirestoreValue);
        if (Object.prototype.toString.call(value) === '[object Object]') {
            var result = {};
            Object.keys(value).forEach(function (key) {
                result[key] = normalizeFirestoreValue(value[key]);
            });
            return result;
        }
        return value;
    }

    function stripUndefined(value) {
        if (value === undefined) return null;
        if (value === null) return null;
        if (Array.isArray(value)) return value.map(stripUndefined);
        if (Object.prototype.toString.call(value) === '[object Object]') {
            var clean = {};
            Object.keys(value).forEach(function (key) {
                if (value[key] !== undefined && typeof value[key] !== 'function') {
                    clean[key] = stripUndefined(value[key]);
                }
            });
            return clean;
        }
        return value;
    }

    var SYNC_METADATA_KEYS_V223 = {
        id: true,
        version: true,
        updatedAt: true,
        updatedByDevice: true,
        createdAt: true,
        deletedAt: true
    };

    function clonePlainV223(value) {
        try { return JSON.parse(JSON.stringify(stripUndefined(value || {}))); }
        catch (error) { return stripUndefined(value || {}); }
    }

    function comparableValueV223(value) {
        value = normalizeFirestoreValue(value);
        if (value === undefined || value === null) return null;
        if (Array.isArray(value)) return value.map(comparableValueV223);
        if (Object.prototype.toString.call(value) === '[object Object]') {
            var result = {};
            Object.keys(value).sort().forEach(function (key) {
                if (SYNC_METADATA_KEYS_V223[key]) return;
                if (value[key] === undefined || typeof value[key] === 'function') return;
                result[key] = comparableValueV223(value[key]);
            });
            return result;
        }
        if (typeof value === 'number' && !isFinite(value)) return 0;
        return value;
    }

    function stableJsonV223(value) {
        try { return JSON.stringify(comparableValueV223(value)); }
        catch (error) { return String(value); }
    }

    function businessEqualV223(left, right) {
        return stableJsonV223(left) === stableJsonV223(right);
    }

    function threeWayMergeV223(basePayload, localPayload, remotePayload) {
        var baseComparable = comparableValueV223(basePayload || {});
        var localComparable = comparableValueV223(localPayload || {});
        var remoteComparable = comparableValueV223(remotePayload || {});
        var keyMap = {};
        Object.keys(baseComparable || {}).forEach(function (key) { keyMap[key] = true; });
        Object.keys(localComparable || {}).forEach(function (key) { keyMap[key] = true; });
        Object.keys(remoteComparable || {}).forEach(function (key) { keyMap[key] = true; });

        var localChangedKeys = [];
        var conflictingKeys = [];
        Object.keys(keyMap).forEach(function (key) {
            var baseValue = stableJsonV223(baseComparable ? baseComparable[key] : undefined);
            var localValue = stableJsonV223(localComparable ? localComparable[key] : undefined);
            var remoteValue = stableJsonV223(remoteComparable ? remoteComparable[key] : undefined);
            var localChanged = localValue !== baseValue;
            var remoteChanged = remoteValue !== baseValue;
            if (localChanged) localChangedKeys.push(key);
            if (localChanged && remoteChanged && localValue !== remoteValue) conflictingKeys.push(key);
        });

        if (conflictingKeys.length) {
            return { ok: false, conflictingKeys: conflictingKeys };
        }

        var merged = clonePlainV223(normalizeFirestoreValue(remotePayload || {}));
        localChangedKeys.forEach(function (key) {
            if (Object.prototype.hasOwnProperty.call(localPayload || {}, key)) merged[key] = clonePlainV223(localPayload[key]);
            else delete merged[key];
        });
        return { ok: true, merged: merged, localChangedKeys: localChangedKeys };
    }

    function isCoreCollection(collection) {
        return COLLECTIONS.indexOf(collection) >= 0;
    }

    function ensureCollectionArrays() {
        COLLECTIONS.forEach(function (collection) {
            if (!Array.isArray(data[collection])) data[collection] = [];
        });
    }

    function localItem(collection, id) {
        if (!isCoreCollection(collection) || !Array.isArray(data[collection])) return null;
        return data[collection].find(function (item) { return item && item.id === id; }) || null;
    }

    function baselineKeyV223(collection, id) {
        return String(collection || '') + '\u0000' + String(id || '');
    }

    function rememberRemoteBaselineV223(collection, id, payload) {
        remoteBaselinesV223[baselineKeyV223(collection, id)] = clonePlainV223(normalizeFirestoreValue(payload || {}));
    }

    function remoteBaselineV223(collection, id) {
        var value = remoteBaselinesV223[baselineKeyV223(collection, id)];
        return value ? clonePlainV223(value) : null;
    }

    function hasQueuedChange(collection, id) {
        return queue.some(function (entry) {
            return entry && entry.collection === collection && entry.id === id;
        });
    }

    function expectedVersionFor(collection, id, item) {
        var explicit = Number(item && item.version);
        if (isFinite(explicit) && explicit >= 0) return explicit;
        var existing = localItem(collection, id);
        var current = Number(existing && existing.version);
        if (isFinite(current) && current >= 0) return current;
        var pending = queue.find(function (entry) {
            return entry && entry.collection === collection && entry.id === id;
        });
        var queued = Number(pending && (pending.baseVersion !== undefined ? pending.baseVersion : pending.data && pending.data.version));
        return isFinite(queued) && queued >= 0 ? queued : 0;
    }

    function scheduleRealtimeRender() {
        if (realtimeRenderTimer) clearTimeout(realtimeRenderTimer);
        realtimeRenderTimer = setTimeout(function () {
            realtimeRenderTimer = null;
            try {
                ensureCollectionArrays();
                persist();
                render();
                if (typeof refreshVisibleFeaturePageV214 === 'function') refreshVisibleFeaturePageV214();
            } catch (error) {
                console.error('Realtime render failed', error);
            }
        }, REALTIME_RENDER_DELAY_V223);
    }

    function hashConflictTextV236(text) {
        // Compact deterministic FNV-1a style fingerprint. It is only used for
        // local deduplication, not as a security primitive.
        var hash = 2166136261;
        text = String(text || '');
        for (var i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
    }

    function conflictFingerprintV236(collection, id, localPayload, remotePayload, conflictingKeys) {
        var keys = Array.isArray(conflictingKeys) ? conflictingKeys.slice(0, 30).map(String).sort() : [];
        return hashConflictTextV236(stableJsonV223({
            collection: String(collection || ''),
            documentId: String(id || ''),
            conflictingKeys: keys,
            local: comparableValueV223(localPayload || {}),
            remote: comparableValueV223(remotePayload || {})
        }));
    }

    function archiveConflict(collection, id, localPayload, remotePayload, conflictingKeys) {
        var key = uidKey('conflicts_v223');
        var conflicts = loadJson(key, []);
        if (!Array.isArray(conflicts)) conflicts = [];

        var detectedAt = nowIso();
        var nowMs = Date.now();
        var normalizedKeys = Array.isArray(conflictingKeys)
            ? conflictingKeys.slice(0, 30).map(String).sort()
            : [];
        var fingerprint = conflictFingerprintV236(collection, id, localPayload, remotePayload, normalizedKeys);
        var duplicateIndex = -1;

        for (var i = conflicts.length - 1; i >= 0; i -= 1) {
            var previous = conflicts[i] || {};
            if (String(previous.fingerprint || '') !== fingerprint) continue;
            var previousTime = Date.parse(previous.lastDetectedAt || previous.detectedAt || '') || 0;
            if (nowMs - previousTime <= CONFLICT_DEDUPE_WINDOW_V236) {
                duplicateIndex = i;
                break;
            }
        }

        if (duplicateIndex >= 0) {
            var duplicate = conflicts[duplicateIndex];
            duplicate.lastDetectedAt = detectedAt;
            duplicate.repeatCount = Math.max(1, Number(duplicate.repeatCount) || 1) + 1;
            duplicate.status = 'resolved';
            duplicate.resolution = 'cloud_wins';
            duplicate.notification = 'silent';
            duplicate.conflictingKeys = normalizedKeys;
            duplicate.local = stripUndefined(localPayload || {});
            duplicate.remote = stripUndefined(remotePayload || {});
        } else {
            conflicts.push({
                id: rid(),
                fingerprint: fingerprint,
                collection: collection,
                documentId: id,
                detectedAt: detectedAt,
                firstDetectedAt: detectedAt,
                lastDetectedAt: detectedAt,
                repeatCount: 1,
                status: 'resolved',
                resolution: 'cloud_wins',
                notification: 'silent',
                conflictingKeys: normalizedKeys,
                local: stripUndefined(localPayload || {}),
                remote: stripUndefined(remotePayload || {})
            });
        }

        if (conflicts.length > CONFLICT_HISTORY_LIMIT_V236) {
            conflicts = conflicts.slice(conflicts.length - CONFLICT_HISTORY_LIMIT_V236);
        }
        saveJson(key, conflicts);

        // FinUp already resolves this condition automatically by applying the
        // cloud revision and preserving the local copy in conflict history.
        // Do not interrupt the user with a recurring red toast. The record is
        // available for diagnostics when the user deliberately opens history.
        return {
            archived: duplicateIndex < 0,
            duplicate: duplicateIndex >= 0,
            fingerprint: fingerprint,
            notification: 'silent'
        };
    }

    function applyRemoteDocument(collection, id, raw, changeType, metadata) {
        if (!isCoreCollection(collection)) return;
        ensureCollectionArrays();
        var index = data[collection].findIndex(function (item) { return item && item.id === id; });
        var incoming = normalizeFirestoreValue(raw || {});
        incoming.id = id;
        var deleted = changeType === 'removed' || incoming.deleted === true || incoming._deleted === true;
        var queued = hasQueuedChange(collection, id);

        if (!(metadata && metadata.hasPendingWrites)) {
            rememberRemoteBaselineV223(collection, id, incoming);
        }

        // A locally queued edit must not be overwritten by an older cache event.
        if (queued && !(metadata && (metadata.hasPendingWrites || metadata.force))) return;

        if (deleted) {
            if (index >= 0) data[collection].splice(index, 1);
        } else if (index >= 0) {
            data[collection][index] = Object.assign({}, data[collection][index], incoming);
        } else {
            data[collection].push(incoming);
        }
        scheduleRealtimeRender();
    }

    function updateRealtimeStatus(text) {
        var online = navigator.onLine;
        var dot = $('syncDot');
        var label = $('syncText');
        if (!dot || !label) return;
        var pendingCount = queue.length + realtimePendingWrites;
        dot.className = 'dot ' + (online ? 'online' : 'offline');
        if (text) {
            label.textContent = text;
        } else if (!online) {
            label.textContent = pendingCount ? 'Offline · ' + pendingCount + ' perubahan tersimpan' : 'Mode offline';
        } else if (realtimeLastError) {
            label.textContent = pendingCount ? pendingCount + ' menunggu sinkron' : 'Gangguan sinkronisasi';
        } else if (pendingCount) {
            label.textContent = pendingCount + ' perubahan sedang dikirim';
        } else if (realtimeReady) {
            label.textContent = 'Tersinkron real-time';
        } else if (realtimeConnected) {
            label.textContent = 'Real-time aktif · memuat data...';
        } else {
            label.textContent = 'Menghubungkan real-time...';
        }
    }

    function rtdbSignalUrlV223(uid, token) {
        return RTDB_URL_V223 + '/finup_sync/' + encodeURIComponent(uid) + '/signal.json?auth=' + encodeURIComponent(token);
    }

    function stopRtdbSignalChannelV223() {
        if (rtdbReconnectTimer) { clearTimeout(rtdbReconnectTimer); rtdbReconnectTimer = null; }
        if (rtdbSignalPullTimer) { clearTimeout(rtdbSignalPullTimer); rtdbSignalPullTimer = null; }
        if (rtdbEventSource) {
            try { rtdbEventSource.close(); } catch (ignore) { }
        }
        rtdbEventSource = null;
        rtdbStartedUid = '';
        rtdbInitialEventSeen = false;
        rtdbConnected = false;
    }

    function scheduleRtdbReconnectV223() {
        if (rtdbReconnectTimer || document.hidden || !navigator.onLine || !session || !session.localId) return;
        var delay = Math.min(60000, RTDB_RECONNECT_DELAY_V223 * Math.pow(2, Math.min(rtdbReconnectAttempts, 4)));
        rtdbReconnectAttempts += 1;
        rtdbReconnectTimer = setTimeout(function () {
            rtdbReconnectTimer = null;
            startRtdbSignalChannelV223(true);
        }, delay);
    }

    function parseRtdbSignalEventV223(event) {
        try {
            var envelope = JSON.parse(event && event.data || '{}');
            var payload = envelope && envelope.data;
            return {
                parsed: true,
                signal: payload && Object.prototype.toString.call(payload) === '[object Object]' ? payload : null
            };
        } catch (error) {
            console.warn('RTDB signal parse failed', error);
            return { parsed: false, signal: null };
        }
    }

    function pullSignaledDocumentV223(signal) {
        var collection = String(signal && signal.collection || '');
        var documentId = String(signal && signal.documentId || '');
        if (!documentId || !firestoreDb || !session || !session.localId) return;

        // Configuration uses a dedicated singleton document instead of the
        // array-based business collections. Let the settings synchronizer pull
        // and apply it without mixing device-only secrets into normal data.
        if (collection === 'settings' && documentId === 'global') {
            if (rtdbSignalPullTimer) clearTimeout(rtdbSignalPullTimer);
            rtdbSignalPullTimer = setTimeout(function () {
                rtdbSignalPullTimer = null;
                if (window.FinUpSettingsSyncV230 && window.FinUpSettingsSyncV230.pullDocument) {
                    window.FinUpSettingsSyncV230.pullDocument();
                }
            }, RTDB_SIGNAL_PULL_DELAY_V223);
            return;
        }

        if (!isCoreCollection(collection)) return;
        if (rtdbSignalPullTimer) clearTimeout(rtdbSignalPullTimer);
        rtdbSignalPullTimer = setTimeout(function () {
            rtdbSignalPullTimer = null;
            var ref = firestoreDb.collection('users').doc(session.localId).collection(collection).doc(documentId);
            ref.get({ source: 'server' }).then(function (snapshot) {
                if (snapshot.exists) {
                    applyRemoteDocument(collection, documentId, snapshot.data(), 'modified', { hasPendingWrites: false });
                } else {
                    applyRemoteDocument(collection, documentId, {}, 'removed', { hasPendingWrites: false });
                }
                realtimeLastError = '';
                updateRealtimeStatus();
            }).catch(function (error) {
                console.warn('RTDB safety pull failed', error);
                // Firestore snapshot listeners remain the primary transport, so
                // a failed safety pull is retried naturally by the listener.
            });
        }, RTDB_SIGNAL_PULL_DELAY_V223);
    }

    function handleRtdbSignalEventV223(event) {
        var parsed = parseRtdbSignalEventV223(event);
        if (!parsed.parsed) return;
        var signal = parsed.signal;
        var nonce = String(signal && signal.nonce || '');
        // RTDB sends an initial PUT even when the path is null. Mark that
        // snapshot as consumed so the first real remote signal is not skipped.
        if (!rtdbInitialEventSeen) {
            rtdbInitialEventSeen = true;
            rtdbLastNonce = nonce;
            return;
        }
        if (!signal || !nonce || nonce === rtdbLastNonce) return;
        rtdbLastNonce = nonce;
        if (String(signal.changedByDeviceId || '') === getDeviceIdV221()) return;
        rtdbLastSignalAt = Number(signal.changedAtMillis) || Date.now();
        pullSignaledDocumentV223(signal);
    }

    function startRtdbSignalChannelV223(force) {
        if (typeof window.EventSource !== 'function' || !RTDB_URL_V223 || !navigator.onLine || document.hidden) return;
        if (!session || !session.localId || !currentFirebaseUser()) return;
        if (!force && rtdbStartedUid === session.localId && rtdbEventSource) return;

        stopRtdbSignalChannelV223();
        rtdbStartedUid = session.localId;
        currentFirebaseUser().getIdToken(false).then(function (token) {
            if (!session || session.localId !== rtdbStartedUid) return;
            var source = new EventSource(rtdbSignalUrlV223(session.localId, token));
            rtdbEventSource = source;
            source.onopen = function () {
                rtdbConnected = true;
                rtdbReconnectAttempts = 0;
                realtimeLastError = '';
                updateRealtimeStatus();
            };
            source.addEventListener('put', handleRtdbSignalEventV223);
            source.addEventListener('patch', handleRtdbSignalEventV223);
            source.addEventListener('cancel', function () {
                rtdbConnected = false;
                try { source.close(); } catch (ignore) { }
                if (rtdbEventSource === source) rtdbEventSource = null;
                scheduleRtdbReconnectV223();
            });
            source.addEventListener('auth_revoked', function () {
                rtdbConnected = false;
                try { source.close(); } catch (ignore) { }
                if (rtdbEventSource === source) rtdbEventSource = null;
                scheduleRtdbReconnectV223();
            });
            source.onerror = function () {
                rtdbConnected = false;
                try { source.close(); } catch (ignore) { }
                if (rtdbEventSource === source) rtdbEventSource = null;
                scheduleRtdbReconnectV223();
                updateRealtimeStatus();
            };
        }).catch(function (error) {
            console.warn('RTDB signal authentication failed', error);
            rtdbConnected = false;
            scheduleRtdbReconnectV223();
        });
    }

    function publishRtdbSignalV223(entry, version) {
        if (!entry || !session || !session.localId || !currentFirebaseUser() || !RTDB_URL_V223 || !navigator.onLine
                || entry.collection === 'activities' || !isCoreCollection(entry.collection)) {
            return Promise.resolve(false);
        }
        var signal = {
            changedAtMillis: Date.now(),
            changedByDeviceId: getDeviceIdV221(),
            appVersion: '2.2.3',
            nonce: rid() + '-' + Math.random().toString(36).slice(2, 10),
            collection: String(entry.collection || ''),
            documentId: String(entry.id || ''),
            operation: entry.op === 'delete' ? 'delete' : 'set',
            version: Number(version) || 0
        };
        return currentFirebaseUser().getIdToken(false).then(function (token) {
            return fetch(rtdbSignalUrlV223(session.localId, token), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Accept': 'application/json' },
                cache: 'no-store',
                body: JSON.stringify(signal)
            }).then(function (response) {
                if (!response.ok) throw new Error('RTDB signal HTTP ' + response.status);
                return true;
            });
        }).catch(function (error) {
            // Signal delivery is best-effort. Firestore listeners and REST
            // fallback still preserve correctness when RTDB is not configured.
            console.warn('RTDB signal publish delayed', error);
            return false;
        });
    }

    function stopRealtimeListeners() {
        stopRtdbSignalChannelV223();
        realtimeListeners.forEach(function (unsubscribe) {
            try { unsubscribe(); } catch (ignore) { }
        });
        realtimeListeners = [];
        if (realtimeSyncTimer) { clearTimeout(realtimeSyncTimer); realtimeSyncTimer = null; }
        realtimeStartedUid = '';
        realtimeInitialCollections = {};
        realtimeReady = false;
        realtimeConnected = false;
        realtimePendingWrites = 0;
        remoteBaselinesV223 = {};
    }

    function startRealtimeListeners() {
        if (!realtimeAvailable || !firestoreDb || !session || !session.localId || !currentFirebaseUser()) return;
        if (realtimeStartedUid === session.localId && realtimeListeners.length) {
            startRtdbSignalChannelV223(false);
            return;
        }
        stopRealtimeListeners();
        realtimeStartedUid = session.localId;
        realtimeLastError = '';
        realtimeReady = false;
        realtimeConnected = false;
        updateRealtimeStatus('Menghubungkan real-time...');

        COLLECTIONS.forEach(function (collection) {
            realtimeInitialCollections[collection] = false;
            var ref = firestoreDb.collection('users').doc(session.localId).collection(collection);
            var unsubscribe = ref.onSnapshot({ includeMetadataChanges: true }, function (snapshot) {
                var pendingForSnapshot = snapshot.metadata && snapshot.metadata.hasPendingWrites ? 1 : 0;
                realtimePendingWrites = Math.max(0, pendingForSnapshot);
                snapshot.docChanges().forEach(function (change) {
                    applyRemoteDocument(collection, change.doc.id, change.doc.data(), change.type, change.doc.metadata || snapshot.metadata);
                });
                realtimeConnected = true;
                realtimeInitialCollections[collection] = true;
                realtimeReady = COLLECTIONS.every(function (name) { return realtimeInitialCollections[name]; });
                realtimeLastError = '';
                updateRealtimeStatus();
            }, function (error) {
                realtimeLastError = firebaseErrorMessage(error);
                console.error('Realtime listener failed for ' + collection, error);
                updateRealtimeStatus('Gagal real-time: ' + realtimeLastError);
            });
            realtimeListeners.push(unsubscribe);
        });
        startRtdbSignalChannelV223(false);
    }

    function docRefFor(entry) {
        return firestoreDb.collection('users').doc(session.localId).collection(entry.collection).doc(entry.id);
    }

    function payloadForTransaction(entry, remoteData, nextVersion) {
        var source = entry.op === 'delete'
            ? { id: entry.id }
            : stripUndefined(entry.data || {});
        var payload = Object.assign({}, source);
        payload.id = entry.id;
        payload.version = nextVersion;
        payload.deleted = entry.op === 'delete' || payload.deleted === true || payload._deleted === true;
        payload.updatedByDevice = getDeviceIdV221();
        payload.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
        if (!remoteData || !remoteData.createdAt) {
            payload.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
        } else {
            payload.createdAt = remoteData.createdAt;
        }
        if (payload.deleted) {
            payload._deleted = true;
            payload.deletedAt = window.firebase.firestore.FieldValue.serverTimestamp();
        } else {
            payload._deleted = false;
            delete payload.deletedAt;
        }
        return payload;
    }

    function writeQueueEntry(entry) {
        var ref = docRefFor(entry);
        var expected = Number(entry.baseVersion);
        if (!isFinite(expected) || expected < 0) expected = expectedVersionFor(entry.collection, entry.id, entry.data);
        return firestoreDb.runTransaction(function (transaction) {
            return transaction.get(ref).then(function (snapshot) {
                var remoteData = snapshot.exists ? snapshot.data() : null;
                var remoteVersion = Number(remoteData && remoteData.version);
                if (!isFinite(remoteVersion) || remoteVersion < 0) remoteVersion = 0;

                if (entry.op === 'increment') {
                    if (!snapshot.exists || (remoteData && (remoteData.deleted === true || remoteData._deleted === true))) {
                        return {
                            conflict: true,
                            remote: normalizeFirestoreValue(remoteData || {}),
                            remoteVersion: remoteVersion,
                            conflictingKeys: [entry.field || 'value']
                        };
                    }
                    var atomicPayload = Object.assign({}, remoteData || {});
                    var currentValue = Number(atomicPayload[entry.field]) || 0;
                    var nextValue = currentValue + Number(entry.delta || 0);
                    if (entry.floor !== undefined && entry.floor !== null) nextValue = Math.max(Number(entry.floor) || 0, nextValue);
                    if (entry.capField) nextValue = Math.min(Number(atomicPayload[entry.capField]) || nextValue, nextValue);
                    atomicPayload[entry.field] = nextValue;
                    var history = Array.isArray(atomicPayload.history) ? atomicPayload.history.slice() : [];
                    if (entry.historyItem && !history.some(function (item) { return item && item.id === entry.historyItem.id; })) {
                        history.push(stripUndefined(entry.historyItem));
                    }
                    atomicPayload.history = history;
                    atomicPayload.id = entry.id;
                    atomicPayload.version = remoteVersion + 1;
                    atomicPayload.deleted = false;
                    atomicPayload._deleted = false;
                    atomicPayload.updatedByDevice = getDeviceIdV221();
                    atomicPayload.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
                    transaction.set(ref, atomicPayload, { merge: false });
                    return { conflict: false, version: remoteVersion + 1, atomicValue: nextValue };
                }

                var localPayload = entry.op === 'delete'
                    ? Object.assign({ id: entry.id, deleted: true, _deleted: true }, entry.data || {})
                    : stripUndefined(entry.data || {});

                if (snapshot.exists && remoteVersion > expected) {
                    var remoteNormalized = normalizeFirestoreValue(remoteData || {});
                    var remoteDevice = String(remoteData && remoteData.updatedByDevice || '');

                    // A newer revision written by this same installation is a
                    // self-echo or a later queued edit. Rebase it instead of
                    // raising a false cross-device conflict.
                    if (remoteDevice === getDeviceIdV221()) {
                        var selfVersion = remoteVersion + 1;
                        var selfPayload = payloadForTransaction(entry, remoteData, selfVersion);
                        transaction.set(ref, selfPayload, { merge: false });
                        return { conflict: false, version: selfVersion, rebased: true };
                    }

                    // Different metadata/version with identical business data is
                    // already synchronized. Acknowledge it without another write.
                    if (businessEqualV223(localPayload, remoteNormalized)) {
                        return { conflict: false, noWrite: true, version: remoteVersion, remote: remoteNormalized };
                    }

                    // Three-way merge: local and remote edits to different fields
                    // can safely coexist. Only overlapping, different values are
                    // treated as a real user conflict.
                    var mergeResult = entry.baseData
                        ? threeWayMergeV223(entry.baseData, localPayload, remoteNormalized)
                        : { ok: false, conflictingKeys: [] };
                    if (mergeResult.ok) {
                        var mergedEntry = Object.assign({}, entry, { data: mergeResult.merged });
                        var mergedVersion = remoteVersion + 1;
                        var mergedPayload = payloadForTransaction(mergedEntry, remoteData, mergedVersion);
                        transaction.set(ref, mergedPayload, { merge: false });
                        return {
                            conflict: false,
                            autoMerged: true,
                            merged: mergeResult.merged,
                            version: mergedVersion
                        };
                    }

                    return {
                        conflict: true,
                        remote: remoteNormalized,
                        remoteVersion: remoteVersion,
                        conflictingKeys: mergeResult.conflictingKeys || []
                    };
                }

                var nextVersion = Math.max(expected, remoteVersion) + 1;
                var payload = payloadForTransaction(entry, remoteData, nextVersion);
                transaction.set(ref, payload, { merge: false });
                return { conflict: false, version: nextVersion };
            });
        }).then(function (result) {
            if (result && result.conflict) {
                archiveConflict(entry.collection, entry.id, entry.data, result.remote, result.conflictingKeys);
                if (isCoreCollection(entry.collection)) {
                    applyRemoteDocument(entry.collection, entry.id, result.remote, 'modified', { hasPendingWrites: false, force: true });
                }
                return { conflict: true };
            }

            if (result && result.noWrite) {
                if (isCoreCollection(entry.collection)) {
                    applyRemoteDocument(entry.collection, entry.id, result.remote, 'modified', { hasPendingWrites: false, force: true });
                }
                return { conflict: false, noWrite: true, version: result.version };
            }

            if (isCoreCollection(entry.collection)) {
                var item = localItem(entry.collection, entry.id);
                if (result && result.autoMerged && result.merged) {
                    applyRemoteDocument(entry.collection, entry.id, Object.assign({}, result.merged, {
                        id: entry.id,
                        version: result.version,
                        updatedByDevice: getDeviceIdV221(),
                        updatedAt: nowIso()
                    }), 'modified', { hasPendingWrites: false, force: true });
                    item = localItem(entry.collection, entry.id);
                }
                if (item) {
                    item.version = result.version;
                    if (entry.op === 'increment' && result.atomicValue !== undefined) item[entry.field] = result.atomicValue;
                    item.updatedByDevice = getDeviceIdV221();
                    item.updatedAt = nowIso();
                    item.deleted = false;
                    item._deleted = false;
                }
            }

            // Do not delay the queue on RTDB availability. The signal is a
            // lightweight accelerator; Firestore remains the source of truth.
            publishRtdbSignalV223(entry, result.version);
            return { conflict: false, version: result.version, autoMerged: !!result.autoMerged };
        });
    }

    function removeCompletedQueueEntry(entry) {
        queue = queue.filter(function (current) {
            if (entry.operationId && current.operationId) return current.operationId !== entry.operationId;
            return !(current.collection === entry.collection
                && current.id === entry.id
                && current.queuedAt === entry.queuedAt
                && current.op === entry.op);
        });
    }

    function flushRealtimeQueue() {
        if (!realtimeAvailable || !firestoreDb || !currentFirebaseUser()) return Promise.reject(new Error('Firebase belum siap.'));
        if (!navigator.onLine) return Promise.resolve(false);
        if (!queue.length) return Promise.resolve(true);

        // Keep writes to the same document sequential, while unrelated documents
        // (for example a transaction and its activity record) can be sent in parallel.
        var groups = {};
        queue.slice().forEach(function (entry) {
            var key = String(entry.collection || '') + '\u0000' + String(entry.id || '');
            if (!groups[key]) groups[key] = [];
            groups[key].push(entry);
        });

        var groupKeys = Object.keys(groups);
        var cursor = 0;
        function processGroup(key) {
            var chain = Promise.resolve();
            groups[key].forEach(function (entry) {
                chain = chain.then(function () {
                    entry.attempts = Number(entry.attempts || 0) + 1;
                    return writeQueueEntry(entry).then(function () {
                        removeCompletedQueueEntry(entry);
                        persist();
                        updateRealtimeStatus();
                    });
                });
            });
            return chain;
        }
        function parallelWorker() {
            var index = cursor++;
            if (index >= groupKeys.length) return Promise.resolve();
            return processGroup(groupKeys[index]).then(parallelWorker);
        }
        var workerCount = Math.min(4, groupKeys.length);
        var workers = [];
        for (var i = 0; i < workerCount; i += 1) workers.push(parallelWorker());
        return Promise.all(workers).then(function () { return true; });
    }

    function scheduleRealtimeSync() {
        if (realtimeSyncTimer) clearTimeout(realtimeSyncTimer);
        realtimeSyncTimer = setTimeout(function () {
            realtimeSyncTimer = null;
            syncNow(false);
        }, REALTIME_SYNC_DELAY_V223);
    }

    async function refreshLicenseIfDueV221(force) {
        if (typeof refreshLicenseState !== 'function' || !session || !session.localId) return;
        var key = uidKey('last_license_check_v221');
        var lastCheck = Number(localStorage.getItem(key)) || 0;
        if (!force && Date.now() - lastCheck < LICENSE_REFRESH_INTERVAL_V223) return;
        await refreshLicenseState(true);
        localStorage.setItem(key, String(Date.now()));
    }

    function queueSetRealtime(collection, item, baseItem) {
        if (!item || !item.id) return;
        ensureCollectionArrays();
        var existing = localItem(collection, item.id);
        var previousEntry = queue.find(function (entry) {
            return entry && entry.collection === collection && entry.id === item.id;
        });
        var baseVersion = previousEntry && isFinite(Number(previousEntry.baseVersion))
            ? Number(previousEntry.baseVersion)
            : expectedVersionFor(collection, item.id, baseItem || existing || item);
        var originalBase = previousEntry && previousEntry.baseData
            ? previousEntry.baseData
            : clonePlainV223(baseItem || remoteBaselineV223(collection, item.id) || existing || {});
        var cleanItem = stripUndefined(Object.assign({}, existing || {}, item));
        cleanItem.id = item.id;
        cleanItem.version = baseVersion;
        cleanItem.deleted = false;
        cleanItem._deleted = false;
        cleanItem.updatedAt = nowIso();
        cleanItem.updatedByDevice = getDeviceIdV221();

        if (isCoreCollection(collection)) {
            var index = data[collection].findIndex(function (candidate) { return candidate && candidate.id === cleanItem.id; });
            if (index >= 0) data[collection][index] = cleanItem;
        }

        queue = queue.filter(function (entry) { return !(entry.collection === collection && entry.id === cleanItem.id); });
        queue.push({
            operationId: rid(),
            op: 'set',
            collection: collection,
            id: cleanItem.id,
            data: cleanItem,
            baseData: originalBase,
            baseVersion: baseVersion,
            queuedAt: nowIso(),
            attempts: 0
        });
        persist();
        updateRealtimeStatus();
        scheduleRealtimeSync();
    }

    function queueAtomicIncrement(collection, id, field, delta, historyItem, capField, floor) {
        var operationId = rid();
        queue.push({
            op: 'increment',
            operationId: operationId,
            collection: collection,
            id: id,
            field: field,
            delta: Number(delta) || 0,
            historyItem: stripUndefined(historyItem || {}),
            capField: capField || '',
            floor: floor,
            queuedAt: nowIso(),
            attempts: 0
        });
        persist();
        updateRealtimeStatus();
        scheduleRealtimeSync();
    }

    function queueDeleteRealtime(collection, id, baseItem) {
        var previousEntry = queue.find(function (entry) {
            return entry && entry.collection === collection && entry.id === id;
        });
        var baseVersion = previousEntry && isFinite(Number(previousEntry.baseVersion))
            ? Number(previousEntry.baseVersion)
            : expectedVersionFor(collection, id, baseItem);
        var originalBase = previousEntry && previousEntry.baseData
            ? previousEntry.baseData
            : clonePlainV223(baseItem || remoteBaselineV223(collection, id) || {});
        queue = queue.filter(function (entry) { return !(entry.collection === collection && entry.id === id); });
        queue.push({
            operationId: rid(),
            op: 'delete',
            collection: collection,
            id: id,
            data: {
                id: id,
                version: baseVersion,
                deleted: true,
                _deleted: true,
                updatedAt: nowIso(),
                updatedByDevice: getDeviceIdV221()
            },
            baseData: originalBase,
            baseVersion: baseVersion,
            queuedAt: nowIso(),
            attempts: 0
        });
        persist();
        updateRealtimeStatus();
        scheduleRealtimeSync();
    }

    async function syncRealtime(showToast) {
        if (!session || !session.localId) return;
        if (!realtimeAvailable || !firestoreDb || !currentFirebaseUser()) {
            return originalFunctions.syncNow ? originalFunctions.syncNow(showToast) : undefined;
        }
        if (syncPromise) return syncPromise;
        if (!navigator.onLine) {
            updateRealtimeStatus();
            if (showToast) toast('Tidak ada koneksi internet. Perubahan tetap tersimpan di perangkat.', true);
            if (typeof finishPullRefresh === 'function') finishPullRefresh();
            return;
        }

        busy = true;
        realtimeLastError = '';
        updateRealtimeStatus(queue.length ? 'Mengirim ' + queue.length + ' perubahan...' : 'Memeriksa sinkronisasi...');
        syncPromise = flushRealtimeQueue().then(async function () {
            try { await refreshLicenseIfDueV221(!!showToast); } catch (licenseError) { console.warn('License refresh delayed', licenseError); }
            if (queue.length) await flushRealtimeQueue();
            lastSyncAt = nowIso();
            localStorage.setItem(uidKey('last_sync'), lastSyncAt);
            lastSyncError = '';
            persist();
            updateRealtimeStatus();
            if (showToast) toast('Data telah tersinkron real-time.');
        }).catch(function (error) {
            realtimeLastError = firebaseErrorMessage(error);
            lastSyncError = realtimeLastError;
            console.error('Realtime sync failed', error);
            updateRealtimeStatus(queue.length ? queue.length + ' menunggu sinkron' : 'Gagal sinkron');
            if (showToast) toast(realtimeLastError, true);
        }).finally(function () {
            busy = false;
            syncPromise = null;
            if (typeof finishPullRefresh === 'function') finishPullRefresh();
        });
        return syncPromise;
    }

    function startRestFallbackPollingV221() {
        if (window.__finupRestFallbackTimerV221) clearInterval(window.__finupRestFallbackTimerV221);
        window.__finupRestFallbackTimerV221 = setInterval(function () {
            if (!document.hidden && navigator.onLine && session && session.localId && originalFunctions.syncNow) {
                originalFunctions.syncNow(false);
            }
        }, 30 * 1000);
    }

    function authReadyPromise() {
        if (!realtimeAvailable || !firebaseAuth) return Promise.resolve(null);
        return new Promise(function (resolve) {
            var settled = false;
            var unsubscribe = firebaseAuth.onAuthStateChanged(function (user) {
                if (settled) return;
                settled = true;
                try { unsubscribe(); } catch (ignore) { }
                resolve(user || null);
            }, function () {
                if (settled) return;
                settled = true;
                resolve(null);
            });
            setTimeout(function () {
                if (!settled) {
                    settled = true;
                    try { unsubscribe(); } catch (ignore) { }
                    resolve(firebaseAuth.currentUser || null);
                }
            }, 8000);
        });
    }

    function overrideApplicationFunctions() {
        updateSyncStatus = updateRealtimeStatus;
        queueSet = queueSetRealtime;
        queueDelete = queueDeleteRealtime;
        syncNow = syncRealtime;

        saveEntity = function (collection, item) {
            ensureCollectionArrays();
            var index = data[collection].findIndex(function (candidate) { return candidate && candidate.id === item.id; });
            var existing = index >= 0 ? data[collection][index] : null;
            var baseSnapshot = clonePlainV223(existing || {});
            var merged = Object.assign({}, existing || {}, item);
            merged.version = expectedVersionFor(collection, item.id, existing || item);
            merged.updatedAt = nowIso();
            merged.updatedByDevice = getDeviceIdV221();
            merged.deleted = false;
            merged._deleted = false;
            if (index >= 0) data[collection][index] = merged;
            else data[collection].push(merged);
            queueSetRealtime(collection, merged, baseSnapshot);
            persist();
            render();
        };

        removeEntity = function (collection, id) {
            ensureCollectionArrays();
            var existing = localItem(collection, id);
            data[collection] = data[collection].filter(function (item) { return item && item.id !== id; });
            queueDeleteRealtime(collection, id, existing);
            persist();
            render();
        };

        // Setoran/penarikan target and debt payments use atomic Firestore
        // transactions, so concurrent operations from two phones are added
        // against the newest server value instead of silently overwriting it.
        if (typeof addGoalContribution === 'function') {
            addGoalContribution = function (id, kind) {
                if (kind === undefined) kind = 'deposit';
                var g = data.goals.find(function (item) { return item.id === id; });
                var input = $('goalAdd');
                var amount = Number(input && input.value);
                var deposit = kind === 'deposit';
                if (!g || !(amount > 0)) { toast('Nominal harus lebih dari nol.', true); return; }
                if (!deposit && amount > Number(g.current || 0)) { toast('Penarikan melebihi dana target yang terkumpul.', true); return; }
                var historyItem = {
                    id: rid(), kind: kind, amount: amount,
                    date: $('goalHistoryDate').value || localDate(),
                    note: $('goalHistoryNote').value.trim(), createdAt: nowIso()
                };
                g.current = Math.max(0, Number(g.current || 0) + (deposit ? amount : -amount));
                g.history = (g.history || []).concat([historyItem]);
                g.updatedAt = nowIso();
                var sourceSelect = $('goalSourceAccount');
                var other = sourceSelect ? sourceSelect.value : '';
                if (g.accountId && other && other !== g.accountId) {
                    saveEntity('transactions', {
                        id: rid(), type: 'transfer', amount: amount,
                        fromAccountId: deposit ? other : g.accountId,
                        toAccountId: deposit ? g.accountId : other,
                        date: historyItem.date,
                        note: (deposit ? 'Setoran' : 'Penarikan') + ' target: ' + g.name,
                        reference: 'Target tabungan', goalId: g.id,
                        createdAt: nowIso(), updatedAt: nowIso()
                    });
                }
                queueAtomicIncrement('goals', id, 'current', deposit ? amount : -amount, historyItem, '', 0);
                persist(); render();
                recordActivity('goal_progress', (deposit ? 'Setoran' : 'Penarikan') + ' target “' + g.name + '”.', { goalId: id, amount: amount });
                closeModal(); toast('Progres target diperbarui.');
            };
        }

        if (typeof addDebtPayment === 'function') {
            addDebtPayment = function (id) {
                var d = data.debts.find(function (item) { return item.id === id; });
                var amount = Number($('debtPay').value);
                if (!d || !(amount > 0)) { toast('Nominal harus lebih dari nol.', true); return; }
                var actual = Math.min(amount, Math.max(0, Number(d.amount || 0) - Number(d.paid || 0)));
                var historyItem = {
                    id: rid(), amount: actual,
                    date: $('debtPayDate').value || localDate(),
                    note: $('debtPayNote').value.trim(), createdAt: nowIso()
                };
                d.paid = Math.min(Number(d.amount), Number(d.paid || 0) + actual);
                d.history = (d.history || []).concat([historyItem]);
                d.updatedAt = nowIso();
                var account = $('debtPayAccount').value;
                if (account) {
                    var type = d.kind === 'receivable' ? 'income' : 'expense';
                    saveEntity('transactions', {
                        id: rid(), type: type, amount: actual, accountId: account,
                        categoryId: debtCategory(d.kind), date: historyItem.date,
                        note: 'Pembayaran ' + (d.kind === 'receivable' ? 'piutang dari' : 'utang kepada') + ' ' + d.person,
                        reference: 'Utang & Piutang', debtId: d.id,
                        createdAt: nowIso(), updatedAt: nowIso()
                    });
                }
                queueAtomicIncrement('debts', id, 'paid', actual, historyItem, 'amount', 0);
                persist(); render();
                recordActivity('debt_payment', 'Pembayaran ' + (d.kind === 'receivable' ? 'piutang' : 'utang') + ' dicatat.', { debtId: id, amount: actual });
                closeModal(); toast('Pembayaran berhasil dicatat.');
            };
        }

        ensureToken = async function (force) {
            var user = currentFirebaseUser();
            if (!user) {
                if (originalFunctions.ensureToken) return originalFunctions.ensureToken(force);
                throw new Error('Sesi login tidak tersedia.');
            }
            var token = await user.getIdToken(!!force);
            saveFirebaseSession(user, token);
            return token;
        };

        submitAuth = async function () {
            var email = $('authEmail').value.trim();
            var password = $('authPassword').value;
            if (!email.includes('@')) {
                message($('authMsg'), 'Masukkan alamat email yang benar.');
                return;
            }
            if (authMode === 'forgot') return sendPasswordReset(email);
            if (password.length < 6) {
                message($('authMsg'), 'Kata sandi minimal 6 karakter.');
                return;
            }
            if (!realtimeAvailable || !firebaseAuth) {
                return originalFunctions.submitAuth ? originalFunctions.submitAuth() : undefined;
            }
            setAuthBusy(true);
            message($('authMsg'), '');
            try {
                var credential = authMode === 'register'
                    ? await firebaseAuth.createUserWithEmailAndPassword(email, password)
                    : await firebaseAuth.signInWithEmailAndPassword(email, password);
                var user = credential.user;
                var token = await user.getIdToken(true);
                saveFirebaseSession(user, token);
                if (authMode === 'register') await sendVerification(false);
                await enterApp();
            } catch (error) {
                message($('authMsg'), firebaseErrorMessage(error));
            } finally {
                setAuthBusy(false);
            }
        };

        sendPasswordReset = async function (email) {
            if (!realtimeAvailable || !firebaseAuth) {
                return originalFunctions.sendPasswordReset ? originalFunctions.sendPasswordReset(email) : undefined;
            }
            setAuthBusy(true);
            try {
                await firebaseAuth.sendPasswordResetEmail(email);
                message($('authMsg'), 'Tautan pemulihan telah dikirim. Periksa kotak masuk atau folder spam.', 'ok');
            } catch (error) {
                message($('authMsg'), firebaseErrorMessage(error));
            } finally {
                setAuthBusy(false);
            }
        };

        sendVerification = async function (show) {
            if (show === undefined) show = true;
            var user = currentFirebaseUser();
            if (!user) return originalFunctions.sendVerification ? originalFunctions.sendVerification(show) : undefined;
            try {
                await user.sendEmailVerification();
                if (show) toast('Email verifikasi telah dikirim.');
            } catch (error) {
                if (show) toast(firebaseErrorMessage(error), true);
            }
        };

        refreshAccountInfo = async function (showResult) {
            if (showResult === undefined) showResult = false;
            var user = currentFirebaseUser();
            if (!user) return !!(session && session.emailVerified);
            if (verificationCheckBusy) return !!(session && session.emailVerified);
            verificationCheckBusy = true;
            var before = !!(session && session.emailVerified);
            try {
                if (navigator.onLine) await user.reload();
                user = currentFirebaseUser() || user;
                var token = await user.getIdToken(!!navigator.onLine);
                saveFirebaseSession(user, token);
                if (user.emailVerified) {
                    stopVerificationPolling();
                    if (!before) toast('Email berhasil diverifikasi. Status akun telah diperbarui.');
                } else {
                    startVerificationPolling();
                }
                render();
                if (showResult) toast(user.emailVerified ? 'Email sudah terverifikasi.' : 'Email belum terverifikasi.', !user.emailVerified);
                return !!user.emailVerified;
            } catch (error) {
                if (showResult) toast(firebaseErrorMessage(error), true);
                return before;
            } finally {
                verificationCheckBusy = false;
            }
        };

        var baseEnterApp = originalFunctions.enterApp;
        enterApp = async function () {
            if (baseEnterApp) await baseEnterApp();
            ensureCollectionArrays();
            startRealtimeListeners();
            updateRealtimeStatus();
        };

        logout = function () {
            if (!confirm('Keluar dari akun FinUp? Data online tetap tersimpan di Firebase.')) return;
            stopRealtimeListeners();
            var signOutPromise = realtimeAvailable && firebaseAuth ? firebaseAuth.signOut() : Promise.resolve();
            Promise.resolve(signOutPromise).catch(function () { }).finally(function () {
                localStorage.removeItem(KSES);
                session = null;
                clearInterval(window.__syncTimer);
                stopVerificationPolling();
                closeModal();
                showOnly('authScreen');
                setAuthMode('login');
                message($('authMsg'), 'Anda telah keluar.', 'ok');
            });
        };

        var baseDeleteAccount = originalFunctions.deleteAccountAndData;
        deleteAccountAndData = async function () {
            // The existing routine asks for confirmation and deletes the user's
            // documents before removing the Authentication account.
            try {
                if (baseDeleteAccount) await baseDeleteAccount();
                if (!session) {
                    stopRealtimeListeners();
                    if (firebaseAuth && firebaseAuth.currentUser) {
                        try { await firebaseAuth.signOut(); } catch (ignore) { }
                    }
                }
            } catch (error) {
                startRealtimeListeners();
                throw error;
            }
        };

        init = async function () {
            initPullGestures();
            document.addEventListener('visibilitychange', function () {
                if (document.hidden) {
                    if (pinEnabled() && session) localStorage.setItem(uidKey('needs_unlock'), '1');
                    return;
                }
                if (pinEnabled() && session && localStorage.getItem(uidKey('needs_unlock')) === '1') showLock();
                if (session) {
                    if (page === 'transactions' && typeof ensureRealtimeTxDateRange === 'function') {
                        ensureRealtimeTxDateRange(true);
                        render();
                    }
                    startRealtimeListeners();
                    finUpOnResume();
                }
            });
            window.addEventListener('online', function () {
                startRealtimeListeners();
                syncNow(false);
                finUpOnResume();
            });
            window.addEventListener('offline', function () { updateRealtimeStatus(); });

            if (!realtimeAvailable) {
                if (originalFunctions.init) return originalFunctions.init();
                return;
            }

            var user = await authReadyPromise();
            if (user) {
                try {
                    var token = await user.getIdToken(false);
                    saveFirebaseSession(user, token);
                    await enterApp();
                    return;
                } catch (error) {
                    console.warn('Restoring Firebase session failed', error);
                }
            }

            // REST tokens from v2.1.x cannot be injected into the Firebase Web
            // SDK. Keep UID-scoped local data, but request one fresh login.
            var legacySession = loadJson(KSES, null);
            if (legacySession && legacySession.localId) {
                localStorage.removeItem(KSES);
                message($('authMsg'), 'Masuk sekali lagi untuk mengaktifkan sinkronisasi real-time. Data lokal Anda tetap tersimpan.', 'info');
            }
            session = null;
            showOnly('authScreen');
            history.replaceState({ screen: 'auth' }, '', '#login');
        };
    }

    if (initFirebaseV221()) {
        overrideApplicationFunctions();
    } else {
        console.warn(realtimeLastError);
        startRestFallbackPollingV221();
    }

    window.FinUpRealtimeV230 = {
        available: function () { return realtimeAvailable; },
        persistenceReady: function () { return firestorePersistenceReady; },
        rtdbConnected: function () { return rtdbConnected; },
        lastSignalAt: function () { return rtdbLastSignalAt; },
        start: startRealtimeListeners,
        stop: stopRealtimeListeners,
        sync: syncRealtime,
        _businessEqual: businessEqualV223,
        _threeWayMerge: threeWayMergeV223,
        _archiveConflict: archiveConflict,
        _conflictFingerprint: conflictFingerprintV236,
        _parseRtdbSignal: parseRtdbSignalEventV223,
        _rtdbSignalUrl: rtdbSignalUrlV223
    };
    // Compatibility alias for diagnostics from earlier builds.
    window.FinUpRealtimeV223 = window.FinUpRealtimeV230;
    window.FinUpRealtimeV221 = window.FinUpRealtimeV230;
})();
