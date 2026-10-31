/**
 * Tiện ích nhận diện và chuẩn hóa các nguồn Tư liệu đa phương tiện (Video, Hình ảnh, YouTube)
 */

export const isYouTubeUrl = (url?: string): boolean => {
  if (!url) return false;
  const trimmed = url.trim();
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/i.test(trimmed);
};

export const getYouTubeEmbedUrl = (url?: string): string => {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.includes('embed/')) {
    const cleanUrl = trimmed.split('&autoplay=')[0].split('?autoplay=')[0];
    return cleanUrl.includes('?') ? `${cleanUrl}&enablejsapi=1` : `${cleanUrl}?enablejsapi=1`;
  }
  let videoId = '';
  if (trimmed.includes('watch?v=')) {
    videoId = trimmed.split('watch?v=')[1]?.split('&')[0];
  } else if (trimmed.includes('youtu.be/')) {
    videoId = trimmed.split('youtu.be/')[1]?.split('?')[0];
  } else if (trimmed.includes('shorts/')) {
    videoId = trimmed.split('shorts/')[1]?.split('?')[0];
  }
  return videoId ? `https://www.youtube.com/embed/${videoId}?enablejsapi=1` : trimmed;
};

export const isVideoSource = (url?: string): boolean => {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();
  if (isYouTubeUrl(url)) return true;
  if (trimmed.startsWith('data:video/')) return true;
  if (
    trimmed.endsWith('.mp4') || 
    trimmed.endsWith('.webm') || 
    trimmed.endsWith('.ogg') || 
    trimmed.endsWith('.mov')
  ) return true;
  if (
    trimmed.includes('.mp4?') || 
    trimmed.includes('/video/upload/') || 
    trimmed.includes('gtv-videos-bucket')
  ) return true;
  return false;
};

export const isImageSource = (url?: string): boolean => {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('data:image/')) return true;
  if (
    trimmed.endsWith('.jpg') || 
    trimmed.endsWith('.jpeg') || 
    trimmed.endsWith('.png') || 
    trimmed.endsWith('.gif') || 
    trimmed.endsWith('.webp') || 
    trimmed.endsWith('.svg') ||
    trimmed.endsWith('.bmp')
  ) return true;
  if (
    trimmed.includes('/image/upload/') || 
    trimmed.includes('cloudinary.com') || 
    trimmed.includes('unsplash.com') || 
    trimmed.includes('googleusercontent.com')
  ) return true;
  if ((trimmed.startsWith('http://') || trimmed.startsWith('https://')) && !isVideoSource(url)) {
    return true;
  }
  return false;
};

export type MediaType = 'youtube' | 'video' | 'image' | 'text' | 'empty';

export const detectMediaType = (url?: string): MediaType => {
  if (!url || !url.trim()) return 'empty';
  if (isYouTubeUrl(url)) return 'youtube';
  if (isVideoSource(url)) return 'video';
  if (isImageSource(url)) return 'image';
  if (url.startsWith('http://') || url.startsWith('https://')) return 'image';
  return 'text';
};
