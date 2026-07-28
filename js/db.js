// Database CRUD Operations via Supabase
import { getSupabase, getCurrentUser } from './auth.js';

const TABLE_NAME = 'logs';
const SOCIAL_TABLE = 'social_profiles';
const PROFILES_TABLE = 'profiles'; // 2026-07-01
const SUBSCRIPTIONS_TABLE = 'subscriptions';
const LOG_IMAGE_BUCKET = 'log-images';
const AVATAR_BUCKET = 'avatars';
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_LOG_IMAGE_COUNT = 8;

export async function createLog(content, generatedPost, postStyle, metadata = {}) {
    const client = getSupabase();
    const user = getCurrentUser();
    const imageFiles = Array.from(metadata.image_files || []).filter(Boolean);
    let uploadedImages = [];

    if (imageFiles.length) {
        uploadedImages = await uploadLogImages(imageFiles);
    }

    const imagePaths = uploadedImages.length
        ? uploadedImages.map(image => image.path)
        : normalizeImagePaths(metadata.image_paths);

    if (!client || !user) {
        return createLocalLog(content, generatedPost, postStyle, {
            ...metadata,
            image_paths: imagePaths
        });
    }

    try {
        const { data, error } = await client
            .from(TABLE_NAME)
            .insert({
                user_id: user.id,
                content,
                generated_post: generatedPost || null,
                post_style: postStyle,
                platform: metadata.platform || 'linkedin',
                image_urls: imagePaths
            })
            .select()
            .single();

        if (error) throw error;
        return resolveLogImages(data);
    } catch (error) {
        await removeStoredLogImages(uploadedImages.map(image => image.path));
        throw error;
    }
}

export async function getLogs(options = {}) {
    const client = getSupabase();
    const user = getCurrentUser();

    if (!client || !user) {
        return getLocalLogs(options);
    }

    let query = client
        .from(TABLE_NAME)
        .select('*')
        .eq('user_id', user.id);

    if (options.style) {
        query = query.eq('post_style', options.style);
    }

    const searchTerm = sanitizeSearchTerm(options.search);

    if (searchTerm) {
        query = query.or(`content.ilike.%${searchTerm}%,generated_post.ilike.%${searchTerm}%`);
    }

    if (options.order === 'oldest') {
        query = query.order('created_at', { ascending: true });
    } else {
        query = query.order('created_at', { ascending: false });
    }

    if (options.limit) {
        query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    return Promise.all((data || []).map(resolveLogImages));
}

export async function updateLog(id, updates) {
    const client = getSupabase();
    const user = getCurrentUser();
    const imageFiles = Array.from(updates.image_files || []).filter(Boolean);
    const safeUpdates = stripImageUpdates(updates);
    let uploadedImages = [];

    if (!client || !user) {
        if (imageFiles.length) {
            uploadedImages = await uploadLogImages(imageFiles);
            safeUpdates.image_urls = uploadedImages.map(image => image.path);
            safeUpdates.image_paths = uploadedImages.map(image => image.path);
        }
        return updateLocalLog(id, safeUpdates);
    }

    const replacesImages = imageFiles.length > 0 || Array.isArray(updates.image_urls);
    let previousImagePaths = [];

    if (replacesImages) {
        const { data: existingLog, error: readError } = await client
            .from(TABLE_NAME)
            .select('image_urls')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        if (readError) throw readError;
        previousImagePaths = normalizeImagePaths(existingLog?.image_urls);
    }

    try {
        if (imageFiles.length) {
            uploadedImages = await uploadLogImages(imageFiles);
            safeUpdates.image_urls = uploadedImages.map(image => image.path);
        }

        const { data, error } = await client
            .from(TABLE_NAME)
            .update(safeUpdates)
            .eq('id', id)
            .eq('user_id', user.id)
            .select()
            .single();

        if (error) throw error;

        if (replacesImages) {
            const nextPaths = normalizeImagePaths(safeUpdates.image_urls);
            const removedPaths = previousImagePaths.filter(path => !nextPaths.includes(path));
            await removeStoredLogImages(removedPaths);
        }

        return resolveLogImages(data);
    } catch (error) {
        await removeStoredLogImages(uploadedImages.map(image => image.path));
        throw error;
    }
}

export async function deleteLog(id) {
    const client = getSupabase();
    const user = getCurrentUser();

    if (!client || !user) {
        return deleteLocalLog(id);
    }

    const { data: existingLog, error: readError } = await client
        .from(TABLE_NAME)
        .select('image_urls')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

    if (readError) throw readError;

    const { error } = await client
        .from(TABLE_NAME)
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

    if (error) throw error;
    await removeStoredLogImages(existingLog?.image_urls);
}

export async function uploadLogImages(files = []) {
    const safeFiles = Array.from(files).filter(Boolean);
    if (!safeFiles.length) return [];
    if (safeFiles.length > MAX_LOG_IMAGE_COUNT) {
        throw new Error(`يمكنك إرفاق ${MAX_LOG_IMAGE_COUNT} صور كحد أقصى.`);
    }

    safeFiles.forEach(validateImageFile);

    const client = getSupabase();
    const user = getCurrentUser();

    if (!client || !user) {
        return Promise.all(safeFiles.map(async (file) => {
            const url = await fileToDataUrl(file);
            return { path: url, url };
        }));
    }

    const uploadResults = await Promise.allSettled(safeFiles.map(async (file) => {
        const imagePath = buildUserImagePath(user.id, file);
        const { error } = await client.storage.from(LOG_IMAGE_BUCKET).upload(imagePath, file, {
            cacheControl: '3600',
            contentType: file.type,
            upsert: false
        });

        if (error) throw error;

        return {
            path: imagePath,
            url: await getSignedStorageUrl(LOG_IMAGE_BUCKET, imagePath)
        };
    }));

    const uploaded = uploadResults
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value);
    const failed = uploadResults.find(result => result.status === 'rejected');

    if (failed) {
        await removeStoredLogImages(uploaded.map(image => image.path));
        throw failed.reason;
    }

    return uploaded;
}

export async function getSocialProfiles() {
    const client = getSupabase();
    const user = getCurrentUser();

    if (!client || !user) {
        return getLocalSocialProfiles();
    }

    const { data, error } = await client
        .from(SOCIAL_TABLE)
        .select('platform, username, profile_url')
        .eq('user_id', user.id);

    if (error) throw error;
    return normalizeSocialProfiles(data || []);
}

export async function saveSocialProfiles(profiles) {
    const normalized = normalizeSocialProfiles(profiles);
    const client = getSupabase();
    const user = getCurrentUser();

    if (!client || !user) {
        localStorage.setItem('devlog-social-profiles', JSON.stringify(normalized));
        return normalized;
    }

    const rows = Object.entries(normalized).map(([platform, profile]) => ({
        user_id: user.id,
        platform,
        username: profile.username,
        profile_url: profile.profile_url
    }));

    const { error } = await client
        .from(SOCIAL_TABLE)
        .upsert(rows, { onConflict: 'user_id,platform' });

    if (error) throw error;
    return normalized;
}

export async function getUserProfile() { // 2026-07-01
    const client = getSupabase(); // 2026-07-01
    const user = getCurrentUser(); // 2026-07-01
 // 2026-07-01
    if (!client || !user) { // 2026-07-01
        return getLocalUserProfile(); // 2026-07-01
    } // 2026-07-01
 // 2026-07-01
    const { data, error } = await client // 2026-07-01
        .from(PROFILES_TABLE) // 2026-07-01
        .select('full_name, username, avatar_path') // 2026-07-01
        .eq('id', user.id) // 2026-07-01
        .maybeSingle(); // 2026-07-01
 // 2026-07-01
    if (error) throw error; // 2026-07-01
    return resolveUserProfile(data || {}); // 2026-07-01
} // 2026-07-01
 // 2026-07-01
export async function saveUserProfile(profile) { // 2026-07-01
    const normalized = normalizeUserProfile(profile); // 2026-07-01
    const client = getSupabase(); // 2026-07-01
    const user = getCurrentUser(); // 2026-07-01
 // 2026-07-01
    if (!client || !user) { // 2026-07-01
        localStorage.setItem('devlog-user-profile', JSON.stringify(normalized)); // 2026-07-01
        return resolveUserProfile(normalized); // 2026-07-07
    } // 2026-07-01
 // 2026-07-01
    const { error } = await client // 2026-07-01
        .from(PROFILES_TABLE) // 2026-07-01
        .upsert({ // 2026-07-01
            id: user.id, // 2026-07-01
            full_name: normalized.full_name, // 2026-07-01
            username: normalized.username, // 2026-07-01
            avatar_path: normalized.avatar_path, // 2026-07-07
            updated_at: new Date().toISOString() // 2026-07-01
        }, { onConflict: 'id' }); // 2026-07-01
 // 2026-07-01
    if (error) throw error; // 2026-07-01
    return normalized; // 2026-07-01
} // 2026-07-01

export async function uploadUserAvatar(file) {
    if (!file) return null;

    validateImageFile(file);

    const client = getSupabase();
    const user = getCurrentUser();

    if (!client || !user) {
        const url = await fileToDataUrl(file);
        return { path: url, url };
    }

    const avatarPath = user.id + '/avatar';
    const { error } = await client.storage.from(AVATAR_BUCKET).upload(avatarPath, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: true
    });

    if (error) throw error;

    return {
        path: avatarPath,
        url: await getSignedStorageUrl(AVATAR_BUCKET, avatarPath, 7 * 24 * 60 * 60)
    };
}

export async function getCurrentSubscription() {
    const client = getSupabase();
    const user = getCurrentUser();

    if (!client || !user) return null;

    const { data, error } = await client
        .from(SUBSCRIPTIONS_TABLE)
        .select('plan,status,end_date,payment_provider,payment_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return data;
}

export async function getStats() {
    const client = getSupabase();
    const user = getCurrentUser();

    if (!client || !user) {
        const logs = getLocalLogs();
        return {
            totalLogs: logs.length,
            postsGenerated: logs.filter(log => log.generated_post).length,
            lastActivity: logs.length > 0 ? formatDate(logs[0].created_at) : '—'
        };
    }

    const [totalResult, generatedResult, latestResult] = await Promise.all([
        client.from(TABLE_NAME).select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        client.from(TABLE_NAME).select('id', { count: 'exact', head: true }).eq('user_id', user.id).not('generated_post', 'is', null),
        client.from(TABLE_NAME).select('created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    ]);

    const error = totalResult.error || generatedResult.error || latestResult.error;
    if (error) throw error;

    const totalLogs = totalResult.count || 0;
    const postsGenerated = generatedResult.count || 0;
    const lastActivity = latestResult.data?.created_at ? formatDate(latestResult.data.created_at) : '—';

    return { totalLogs, postsGenerated, lastActivity };
}

// Local Storage Fallback
function getLocalStorage() {
    const data = localStorage.getItem('devlog-logs');
    return safeJsonParse(data, []);
}

function saveLocalStorage(logs) {
    localStorage.setItem('devlog-logs', JSON.stringify(logs));
}

function stripImageUpdates(updates = {}) {
    const { image_paths, image_files, ...safeUpdates } = updates;
    if (Array.isArray(updates.image_urls)) {
        safeUpdates.image_urls = normalizeImagePaths(updates.image_urls);
    }
    return safeUpdates;
}

async function resolveLogImages(log) {
    const paths = Array.isArray(log.image_urls) ? log.image_urls : [];
    const imageUrls = await Promise.all(paths.map(async (path) => {
        if (path.startsWith('data:') || path.startsWith('http') || path.startsWith('blob:')) return path;
        return getSignedStorageUrl(LOG_IMAGE_BUCKET, path);
    }));

    return {
        ...log,
        image_paths: paths,
        image_urls: imageUrls.filter(Boolean)
    };
}

function createLocalLog(content, generatedPost, postStyle, metadata = {}) {
    const logs = getLocalStorage();
    const newLog = {
        id: Date.now().toString(),
        user_id: 'local',
        content,
        generated_post: generatedPost || null,
        post_style: postStyle,
        platform: metadata.platform || 'linkedin',
        image_urls: normalizeImagePaths(metadata.image_paths),
        image_paths: normalizeImagePaths(metadata.image_paths),
        created_at: new Date().toISOString()
    };
    logs.unshift(newLog);
    saveLocalStorage(logs);
    return newLog;
}

function getLocalLogs(options = {}) {
    let logs = getLocalStorage();

    if (options.style) {
        logs = logs.filter(l => l.post_style === options.style);
    }

    const searchTerm = sanitizeSearchTerm(options.search);

    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        logs = logs.filter(l =>
            l.content.toLowerCase().includes(term) ||
            (l.generated_post && l.generated_post.toLowerCase().includes(term))
        );
    }

    if (options.order === 'oldest') {
        logs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else {
        logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    if (options.limit) {
        logs = logs.slice(0, options.limit);
    }

    return logs;
}

function updateLocalLog(id, updates) {
    const logs = getLocalStorage();
    const index = logs.findIndex(l => l.id === id);
    if (index === -1) throw new Error('السجل غير موجود');
    logs[index] = { ...logs[index], ...updates };
    saveLocalStorage(logs);
    return logs[index];
}

function deleteLocalLog(id) {
    const logs = getLocalStorage();
    const filtered = logs.filter(l => l.id !== id);
    saveLocalStorage(filtered);
}

export function formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'الآن';
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    if (hours < 24) return `منذ ${hours} ساعة`;
    if (days < 7) return `منذ ${days} يوم`;

    return date.toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function validateImageFile(file) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        throw new Error('صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP أو GIF.');
    }

    if (file.size > MAX_IMAGE_SIZE) {
        throw new Error('حجم الصورة يجب ألا يتجاوز 5 ميجابايت.');
    }
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('تعذر قراءة الصورة من الجهاز.'));
        reader.readAsDataURL(file);
    });
}

function buildUserImagePath(userId, file) {
    const extension = getImageExtension(file);
    const id = crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${userId}/${id}.${extension}`;
}

function getImageExtension(file) {
    const fromType = file.type?.split('/')[1];
    if (fromType === 'jpeg') return 'jpg';
    if (fromType) return fromType.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';

    const fromName = file.name?.split('.').pop();
    return fromName ? fromName.replace(/[^a-z0-9]/gi, '').toLowerCase() : 'jpg';
}

function normalizeImagePaths(paths = []) {
    return Array.isArray(paths)
        ? paths.map(path => String(path || '').trim()).filter(Boolean).slice(0, 8)
        : [];
}

function getLocalSocialProfiles() {
    const saved = localStorage.getItem('devlog-social-profiles');
    return normalizeSocialProfiles(safeJsonParse(saved, {}));
}

function getLocalUserProfile() { // 2026-07-01
    const saved = localStorage.getItem('devlog-user-profile'); // 2026-07-01
    return resolveUserProfile(safeJsonParse(saved, {})); // 2026-07-07
} // 2026-07-01
 // 2026-07-01
function normalizeUserProfile(profile = {}) { // 2026-07-01
    return { // 2026-07-01
        full_name: sanitizeProfileName(profile.full_name), // 2026-07-01
        username: sanitizeUsername(profile.username), // 2026-07-01
        avatar_path: sanitizeAvatarPath(profile.avatar_path || profile.avatar_url) // 2026-07-07
    }; // 2026-07-01
} // 2026-07-01

async function resolveUserProfile(profile = {}) {
    const normalized = normalizeUserProfile(profile);
    const avatarPath = normalized.avatar_path;
    const isInlineUrl = avatarPath.startsWith('data:') || avatarPath.startsWith('blob:') || avatarPath.startsWith('http');

    return {
        ...normalized,
        avatar_url: isInlineUrl ? avatarPath : await getSignedStorageUrl(AVATAR_BUCKET, avatarPath, 7 * 24 * 60 * 60)
    };
}

async function getSignedStorageUrl(bucket, storagePath, expiresIn = 60 * 60) {
    if (!storagePath) return '';

    const client = getSupabase();
    if (!client) return '';

    const { data, error } = await client.storage.from(bucket).createSignedUrl(storagePath, expiresIn);
    if (error) return '';
    return data?.signedUrl || '';
}

async function removeStoredLogImages(paths = []) {
    const storagePaths = normalizeImagePaths(paths).filter(path =>
        !path.startsWith('data:')
        && !path.startsWith('blob:')
        && !/^https?:/i.test(path)
    );

    if (!storagePaths.length) return;

    const client = getSupabase();
    const user = getCurrentUser();
    if (!client || !user) return;

    const ownedPaths = storagePaths.filter(path => path.startsWith(`${user.id}/`));
    if (!ownedPaths.length) return;

    const { error } = await client.storage.from(LOG_IMAGE_BUCKET).remove(ownedPaths);
    if (error) {
        console.warn('Unable to remove stored log images:', error.message);
    }
}

function safeJsonParse(value, fallback) {
    if (!value) return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}
 // 2026-07-01
function sanitizeProfileName(value = '') { // 2026-07-01
    return String(value).trim().slice(0, 120); // 2026-07-01
} // 2026-07-01

function sanitizeAvatarPath(value = '') {
    return String(value).trim().replace(/^\/+/, '').slice(0, 500);
}

function normalizeSocialProfiles(profiles) {
    const defaults = {
        linkedin: { username: '', profile_url: '' },
        x: { username: '', profile_url: '' },
        instagram: { username: '', profile_url: '' }
    };

    if (Array.isArray(profiles)) {
        profiles.forEach(profile => {
            if (!defaults[profile.platform]) return;
            defaults[profile.platform] = {
                username: sanitizeUsername(profile.username),
                profile_url: sanitizeProfileUrl(profile.profile_url)
            };
        });
        return defaults;
    }

    Object.keys(defaults).forEach(platform => {
        defaults[platform] = {
            username: sanitizeUsername(profiles?.[platform]?.username),
            profile_url: sanitizeProfileUrl(profiles?.[platform]?.profile_url)
        };
    });

    return defaults;
}

function sanitizeUsername(value = '') {
    return String(value).trim().replace(/^@+/, '').slice(0, 80);
}

function sanitizeSearchTerm(value = '') {
    return String(value)
        .trim()
        .replace(/[,%()]/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, 80);
}

function sanitizeProfileUrl(value = '') {
    const url = String(value).trim();
    if (!url) return '';

    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString().slice(0, 300) : '';
    } catch {
        return '';
    }
}
