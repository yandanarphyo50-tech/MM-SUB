import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ExternalLink,
  HelpCircle,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import { GuestShareHelpModal } from './components/GuestShareHelpModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { StandaloneVideoDownloaderView } from './components/StandaloneVideoDownloaderView';
import { StudioHomeHub } from './components/StudioHomeHub';
import { StudioToolDeck } from './components/StudioToolDeck';
import { ToolsGuideModal, type GuideToolTargetId } from './components/ToolsGuideModal';
import { VideoMonitor } from './components/VideoMonitor';
import {
  CookieCheckError,
  canRequestStorageAccess,
  checkServerSessionDetailed,
  checkServerSessionOk,
  extractFirstHttpUrl,
  fetchAuthenticatedBlob,
  fetchVideoBlobInChunks,
  getAsciiSafeMp4Filename,
  getSessionRefreshHref,
  isEmbeddedIframe,
  isInAppBrowser,
  isNetworkFetchError,
  isOwnAppUrl,
  parseApiResponse,
  postFormDataResilient,
  postRawChunkResilient,
  resilientFetch,
  triggerBlobDownload,
  triggerDirectDownload,
  triggerObjectUrlDownload,
  tryRequestStorageAccess,
} from './lib/api';
import { prepareLogoFileForUpload } from './lib/logoMaker';
import {
  mergeSrtCues,
  parseFlexInputTime,
  parseSrt,
  serializeSrt,
  type SrtCue,
} from './lib/srt';
import {
  APP_BRAND_LOGO_URL,
  CREATOR_FACEBOOK_URL,
  DEFAULT_LOGO_CONFIG,
  DEFAULT_TEXT_LOGO_CONFIG,
  SUBTITLE_POSITIONS,
  type DownloadQualityId,
  type DownloadedVideoItem,
  type GeminiModelId,
  type InspectedVideoLinkInfo,
  type LogoOverlayConfig,
  type RenderResult,
  type StudioToolId,
  type StudioVideoMeta,
  type SubtitleAnimationId,
  type SubtitleColorId,
  type SubtitleModeId,
  type SubtitlePositionId,
  type TextLogoConfig,
  type UploadedLogoMeta,
  type VideoAspectId,
  type VideoFitModeId,
} from './lib/studioTypes';

const CHUNK_SIZE = 256 * 1024; // 256 KB chunks for rock-solid mobile & cellular uploads
const UPLOAD_RETRY_DELAYS_MS = [600, 1400];

function createUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function readBlobSliceSafely(blob: Blob): Promise<ArrayBuffer> {
  try {
    return await blob.arrayBuffer();
  } catch {
    throw new Error(
      'ရွေးချယ်ထားသော ဖိုင်ကို ဖတ်မရပါ (Google Drive / Cloud ဖိုင်ဖြစ်နိုင်သည်) — ဖုန်း Internal Storage (Downloads) ထဲသို့ အရင် Save ပြီးမှ ရွေးချယ်ပေးပါ။'
    );
  }
}

export default function App() {
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [videoMeta, setVideoMeta] = useState<StudioVideoMeta | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'hub' | 'editor' | 'downloader'>('hub');
  const [openToolId, setOpenToolId] = useState<StudioToolId | null>('ai_subtitle');

  const [modeId, setModeId] = useState<SubtitleModeId>('english_to_burmese');
  const [modelId, setModelId] = useState<GeminiModelId>('gemini-4-hydrogen');
  const [translationScope, setTranslationScope] = useState<'full' | 'range'>('full');
  const [rangeStartInput, setRangeStartInput] = useState('00:00');
  const [rangeEndInput, setRangeEndInput] = useState('');
  const [mergeRangeIntoExisting, setMergeRangeIntoExisting] = useState(true);
  const [customPrompt, setCustomPrompt] = useState('');
  const [videoDuration, setVideoDuration] = useState(0);
  const [srtText, setSrtText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTranslatingSrt, setIsTranslatingSrt] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [colorPresetId, setColorPresetId] = useState<string>('teal_orange');
  const [brightness, setBrightness] = useState<number>(0.0);
  const [contrast, setContrast] = useState<number>(1.0);
  const [saturation, setSaturation] = useState<number>(1.0);

  const [fontName, setFontName] = useState<string>('Noto Sans Myanmar');
  const [fontSize, setFontSize] = useState<number>(22);
  const [textColorId, setTextColorId] = useState<SubtitleColorId>('rainbow');
  const [positionId, setPositionId] = useState<SubtitlePositionId>('bottom');
  const [subtitleX, setSubtitleX] = useState<number>(50);
  const [subtitleY, setSubtitleY] = useState<number>(88);
  const [showPositionGuide, setShowPositionGuide] = useState<boolean>(false);
  const [subtitleAnimation, setSubtitleAnimation] = useState<SubtitleAnimationId>('word_pop');
  const [videoAspectId, setVideoAspectId] = useState<VideoAspectId>('original');
  const [videoFitMode, setVideoFitMode] = useState<VideoFitModeId>('blur_fit');

  const [logoMeta, setLogoMeta] = useState<UploadedLogoMeta | null>(null);
  const [logoConfig, setLogoConfig] = useState<LogoOverlayConfig>(DEFAULT_LOGO_CONFIG);
  const [textLogoConfig, setTextLogoConfig] = useState<TextLogoConfig>(
    DEFAULT_TEXT_LOGO_CONFIG
  );
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  const [downloaderUrl, setDownloaderUrl] = useState('');
  const [downloaderQuality, setDownloaderQuality] = useState<DownloadQualityId>('best');
  const [inspectedLinkInfo, setInspectedLinkInfo] =
    useState<InspectedVideoLinkInfo | null>(null);
  const [isInspectingLink, setIsInspectingLink] = useState(false);
  const [isDownloadingLink, setIsDownloadingLink] = useState(false);
  const [linkDownloadError, setLinkDownloadError] = useState<string | null>(null);
  const [downloadedItems, setDownloadedItems] = useState<DownloadedVideoItem[]>([]);
  const [savingDownloadId, setSavingDownloadId] = useState<string | null>(null);
  const [savingDownloadProgress, setSavingDownloadProgress] = useState<number | null>(
    null
  );
  const [loadingToStudioId, setLoadingToStudioId] = useState<string | null>(null);

  const [isRendering, setIsRendering] = useState(false);
  const [isDownloadingMp4, setIsDownloadingMp4] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);
  const [activeMonitorTab, setActiveMonitorTab] = useState<'preview' | 'rendered'>('preview');
  const [cookieAuthNeeded, setCookieAuthNeeded] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [showToolsGuide, setShowToolsGuide] = useState(false);
  const [showGuestShareHelp, setShowGuestShareHelp] = useState(false);

  const [currentTime, setCurrentTime] = useState(0);
  const [seekRequestTime, setSeekRequestTime] = useState<number | null>(null);

  const monitorSectionRef = useRef<HTMLDivElement | null>(null);
  const toolsSectionRef = useRef<HTMLDivElement | null>(null);
  const selectedFileRef = useRef<File | null>(null);
  const logoFileRef = useRef<File | null>(null);
  const positionGuideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cues = useMemo(() => parseSrt(srtText), [srtText]);

  useEffect(() => {
    let active = true;
    const verifySession = async () => {
      const detail = await checkServerSessionDetailed();
      if (!active) return;
      if (!detail.offline && (detail.authBlocked || !detail.sessionOk)) {
        if (detail.authBlocked && !isEmbeddedIframe() && !isInAppBrowser()) {
          try {
            const lastAttempt = Number(
              sessionStorage.getItem('mv_studio_reauth_at') || '0'
            );
            if (!lastAttempt || Date.now() - lastAttempt > 20_000) {
              sessionStorage.setItem('mv_studio_reauth_at', String(Date.now()));
              window.location.replace(`/api/session-entry?ts=${Date.now()}`);
              return;
            }
          } catch {
            // ignore sessionStorage errors
          }
        }
        setCookieAuthNeeded(true);
      } else {
        setCookieAuthNeeded(false);
        setUploadError((prev) =>
          prev && prev.includes('Security Cookie') ? null : prev
        );
      }
    };

    void verifySession();

    const handleFocus = () => {
      void verifySession();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void verifySession();
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (positionGuideTimerRef.current) {
        clearTimeout(positionGuideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (localVideoUrl) {
        URL.revokeObjectURL(localVideoUrl);
      }
    };
  }, [localVideoUrl]);

  useEffect(() => {
    return () => {
      if (logoMeta?.previewUrl) {
        URL.revokeObjectURL(logoMeta.previewUrl);
      }
    };
  }, [logoMeta?.previewUrl]);

  useEffect(() => {
    return () => {
      if (renderResult?.blobUrl) {
        URL.revokeObjectURL(renderResult.blobUrl);
      }
    };
  }, [renderResult?.blobUrl]);

  const uploadFileToServer = useCallback(async (file: File): Promise<StudioVideoMeta> => {
    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    try {
      if (file.size === 0) {
        throw new Error('ရွေးချယ်ထားသော ဗီဒီယိုဖိုင် အလွတ်ဖြစ်နေပါသည် (0 bytes)။');
      }
      const sessionDetail = await checkServerSessionDetailed();
      if (sessionDetail.offline) {
        throw new Error(
          'အင်တာနက် ချိတ်ဆက်မှု ပြတ်တောက်နေပါသည်။ Wi-Fi / Mobile Data ကို စစ်ဆေးပြီး ပြန်တင်မည် နှိပ်ပါ။'
        );
      }
      if (sessionDetail.authBlocked || !sessionDetail.sessionOk) {
        throw new CookieCheckError();
      }
      const uploadId = createUuid();
      const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
      let finalMeta: StudioVideoMeta | null = null;

      type ChunkResponse = {
        done: boolean;
        videoId?: string;
        filename?: string;
        sizeBytes?: number;
        mimeType?: string;
      };

      for (let idx = 0; idx < totalChunks; idx++) {
        const start = idx * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const slice = file.slice(start, end);
        // Buffer slice in RAM so mobile browsers do not fail with ERR_UPLOAD_FILE_CHANGED or Drive read errors
        const sliceBytes = await readBlobSliceSafely(slice);
        const chunkBlob = new Blob([sliceBytes], {
          type: 'application/octet-stream',
        });

        let chunkData: ChunkResponse | null = null;
        const qs = new URLSearchParams({
          uploadId,
          chunkIndex: String(idx),
          totalChunks: String(totalChunks),
          filename: file.name,
          mimeType: file.type || 'video/mp4',
        });

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            // Primary path: raw binary octet-stream avoids mobile FormData boundary/proxy issues
            chunkData = await postRawChunkResilient<ChunkResponse>(
              `/api/videos/upload-chunk-raw?${qs.toString()}`,
              sliceBytes,
              60_000,
              'အင်တာနက်လိုင်း နှေးနေပါသည်။ ထပ်မံကြိုးစားပေးပါ။'
            );
            break;
          } catch (rawErr) {
            if (rawErr instanceof CookieCheckError) {
              throw rawErr;
            }
            // Secondary fallback: multipart FormData upload
            const formData = new FormData();
            formData.append('chunk', chunkBlob, `chunk_${idx}`);
            formData.append('uploadId', uploadId);
            formData.append('chunkIndex', String(idx));
            formData.append('totalChunks', String(totalChunks));
            formData.append('filename', file.name);
            formData.append('mimeType', file.type || 'video/mp4');

            try {
              chunkData = await postFormDataResilient<ChunkResponse>(
                '/api/videos/upload-chunk',
                formData,
                60_000,
                'အင်တာနက်လိုင်း နှေးနေပါသည်။ ထပ်မံကြိုးစားပေးပါ။'
              );
              break;
            } catch (chunkErr) {
              if (chunkErr instanceof CookieCheckError || attempt === 2) {
                throw chunkErr;
              }
              await new Promise((r) => setTimeout(r, UPLOAD_RETRY_DELAYS_MS[attempt] ?? 1400));
            }
          }
        }

        setUploadProgress(Math.round(((idx + 1) / totalChunks) * 100));

        if (chunkData?.done && chunkData.videoId) {
          finalMeta = {
            videoId: chunkData.videoId,
            filename: chunkData.filename || file.name,
            sizeBytes: chunkData.sizeBytes || file.size,
            mimeType: chunkData.mimeType || file.type || 'video/mp4',
          };
        }
      }

      if (!finalMeta) {
        throw new Error('ဗီဒီယို Upload အဆုံးသတ်မအောင်မြင်ပါ။');
      }
      setVideoMeta(finalMeta);
      return finalMeta;
    } catch (err) {
      if (
        err instanceof CookieCheckError ||
        (isNetworkFetchError(err) && (isEmbeddedIframe() || isInAppBrowser()))
      ) {
        setCookieAuthNeeded(true);
      }
      setVideoMeta(null);
      const msg = isNetworkFetchError(err)
        ? 'Server နှင့် ချိတ်ဆက်မှု ယာယီပြတ်တောက်သွားပါသည်။ Chrome Tab အသစ်တွင် ဖွင့်ကြည့်ပါ (သို့) "ပြန်တင်မည် (Retry)" ကို နှိပ်ပေးပါ။'
        : err instanceof Error
        ? err.message
        : 'ဗီဒီယို Upload လုပ်ရာတွင် အမှားဖြစ်ပွားပါသည်။';
      setUploadError(msg);
      throw err;
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  }, []);

  const handleSelectFile = useCallback(
    async (file: File) => {
      selectedFileRef.current = file;
      setVideoMeta(null);
      setUploadError(null);
      setGenerateError(null);
      setRenderError(null);
      setCookieAuthNeeded(false);
      setVideoDuration(0);
      setRangeStartInput('00:00');
      setRangeEndInput('');
      setRenderResult((prev) => {
        if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl);
        return null;
      });
      setActiveMonitorTab('preview');

      if (localVideoUrl) {
        URL.revokeObjectURL(localVideoUrl);
      }
      const nextUrl = URL.createObjectURL(file);
      setLocalVideoUrl(nextUrl);

      try {
        await uploadFileToServer(file);
      } catch {
        // Error state already captured in uploadError
      }
    },
    [localVideoUrl, uploadFileToServer]
  );

  const handleRetryUpload = useCallback(async () => {
    if (!selectedFileRef.current || isUploading) return;
    try {
      await uploadFileToServer(selectedFileRef.current);
    } catch {
      // Error state already captured in uploadError
    }
  }, [isUploading, uploadFileToServer]);

  const handleUnlockPreviewCookies = useCallback(async () => {
    await tryRequestStorageAccess();
    const ok = await checkServerSessionOk();
    if (ok) {
      setCookieAuthNeeded(false);
      setUploadError(null);
      if (selectedFileRef.current && !videoMeta && !isUploading) {
        try {
          await uploadFileToServer(selectedFileRef.current);
        } catch {
          // Error captured in uploadError
        }
      }
    }
  }, [isUploading, uploadFileToServer, videoMeta]);

  const handleGenerateSubtitles = useCallback(async () => {
    if (isUploading) {
      setGenerateError('ဗီဒီယို Server သို့ တင်နေဆဲဖြစ်ပါသည်။ ခေတ္တစောင့်ပေးပါ။');
      return;
    }

    if (!videoMeta?.videoId && !selectedFileRef.current) {
      setGenerateError('ကျေးဇူးပြု၍ ဗီဒီယိုဖိုင် အရင်တင်ပေးပါ။');
      return;
    }

    let startSec: number | undefined;
    let endSec: number | undefined;
    if (translationScope === 'range') {
      const parsedStart = rangeStartInput.trim()
        ? parseFlexInputTime(rangeStartInput)
        : 0;
      if (parsedStart === null) {
        setGenerateError('စမည့်အချိန် Format မမှန်ပါ (ဥပမာ- 00:30 သို့မဟုတ် 01:15)။');
        return;
      }
      startSec = parsedStart;

      if (rangeEndInput.trim()) {
        const parsedEnd = parseFlexInputTime(rangeEndInput);
        if (parsedEnd === null) {
          setGenerateError('ဆုံးမည့်အချိန် Format မမှန်ပါ (ဥပမာ- 01:45 သို့မဟုတ် 03:00)။');
          return;
        }
        if (parsedEnd <= parsedStart) {
          setGenerateError('ဆုံးမည့်အချိန်သည် စမည့်အချိန်ထက် ကြီးရပါမည်။');
          return;
        }
        endSec = parsedEnd;
      } else if (videoDuration > 0) {
        endSec = videoDuration;
      }
    }

    setGenerateError(null);
    setCookieAuthNeeded(false);
    setIsGenerating(true);
    try {
      let activeVideoId = videoMeta?.videoId;
      if (!activeVideoId && selectedFileRef.current) {
        const reuploaded = await uploadFileToServer(selectedFileRef.current);
        activeVideoId = reuploaded.videoId;
      }

      const requestSubtitles = async (targetVideoId: string) => {
        const res = await resilientFetch(
          '/api/subtitles/generate',
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              videoId: targetVideoId,
              mode: modeId,
              model: modelId,
              startSec,
              endSec,
              customPrompt: customPrompt.trim() || undefined,
            }),
          },
          300_000,
          'AI ဘာသာပြန်ချိန် ၅ မိနစ်ကျော်သွားပါသည်။ သီချင်းအပိုင်းခွဲ (Range) ဖြင့် ထပ်မံကြိုးစားကြည့်ပါ။'
        );
        return await parseApiResponse<{
          srt: string;
          rangeStartSec?: number;
          rangeEndSec?: number;
        }>(res);
      };

      let data: { srt: string; rangeStartSec?: number; rangeEndSec?: number };
      try {
        data = await requestSubtitles(activeVideoId!);
      } catch (firstErr) {
        const errMsg = firstErr instanceof Error ? firstErr.message : '';
        // If Cloud Run restarted and cleared /tmp uploads, transparently re-upload selected file once
        if (errMsg.includes('အရင်တင်ပေးပါ') && selectedFileRef.current) {
          const reuploaded = await uploadFileToServer(selectedFileRef.current);
          data = await requestSubtitles(reuploaded.videoId);
        } else {
          throw firstErr;
        }
      }

      if (!data.srt) {
        throw new Error('AI ထံမှ စာတန်းမရရှိပါ။');
      }

      if (
        translationScope === 'range' &&
        mergeRangeIntoExisting &&
        cues.length > 0
      ) {
        const incomingCues = parseSrt(data.srt);
        const merged = mergeSrtCues(
          cues,
          incomingCues,
          data.rangeStartSec ?? startSec,
          data.rangeEndSec ?? endSec
        );
        setSrtText(serializeSrt(merged));
      } else {
        setSrtText(data.srt);
      }
    } catch (err) {
      if (err instanceof CookieCheckError) {
        setCookieAuthNeeded(true);
      }
      setGenerateError(
        err instanceof Error ? err.message : 'AI စာတန်းထုတ်ရာတွင် အမှားဖြစ်ပွားပါသည်။'
      );
    } finally {
      setIsGenerating(false);
    }
  }, [
    isUploading,
    videoMeta,
    uploadFileToServer,
    modeId,
    modelId,
    translationScope,
    rangeStartInput,
    rangeEndInput,
    mergeRangeIntoExisting,
    customPrompt,
    videoDuration,
    cues,
  ]);

  const handleTranslateExistingSrt = useCallback(async () => {
    if (!srtText.trim()) {
      setGenerateError('ဘာသာပြန်ရန် .srt စာတန်းများ အရင်ထည့်ပေးပါ။');
      return;
    }

    setGenerateError(null);
    setCookieAuthNeeded(false);
    setIsTranslatingSrt(true);
    try {
      const res = await resilientFetch(
        '/api/subtitles/translate-srt',
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            srtText,
            mode: modeId,
            model: modelId,
            customPrompt: customPrompt.trim() || undefined,
          }),
        },
        180_000,
        'ဘာသာပြန်ချိန် ကြာမြင့်နေပါသည်။ ထပ်မံကြိုးစားကြည့်ပါ။'
      );
      const data = await parseApiResponse<{ srt: string }>(res);
      if (!data.srt) {
        throw new Error('AI ထံမှ ဘာသာပြန်စာတန်း မရရှိပါ။');
      }
      setSrtText(data.srt);
    } catch (err) {
      if (err instanceof CookieCheckError) {
        setCookieAuthNeeded(true);
      }
      setGenerateError(
        err instanceof Error ? err.message : 'AI ဘာသာပြန်ရာတွင် အမှားဖြစ်ပွားပါသည်။'
      );
    } finally {
      setIsTranslatingSrt(false);
    }
  }, [srtText, modeId, modelId, customPrompt]);

  const uploadPreparedLogoToServer = useCallback(async (prepared: File) => {
    const formData = new FormData();
    formData.append('logo', prepared);

    return await postFormDataResilient<{
      logoId: string;
      filename: string;
      sizeBytes: number;
      mimeType: string;
    }>(
      '/api/logos/upload',
      formData,
      60_000,
      'Logo Upload လုပ်ချိန် ကြာမြင့်နေပါသည်။ ထပ်မံကြိုးစားပေးပါ။'
    );
  }, []);

  const handleUploadLogoFile = useCallback(
    async (rawFile: File) => {
      setLogoError(null);
      setCookieAuthNeeded(false);
      setIsUploadingLogo(true);
      try {
        const prepared = await prepareLogoFileForUpload(rawFile);
        logoFileRef.current = prepared;
        const data = await uploadPreparedLogoToServer(prepared);

        const previewUrl = URL.createObjectURL(prepared);
        setLogoMeta({
          ...data,
          previewUrl,
        });
        setLogoConfig((prev) => ({ ...prev, enabled: true }));
        setActiveMonitorTab('preview');
      } catch (err) {
        if (err instanceof CookieCheckError) {
          setCookieAuthNeeded(true);
        }
        setLogoError(
          err instanceof Error ? err.message : 'Logo Upload လုပ်ရာတွင် အမှားဖြစ်ပွားပါသည်။'
        );
      } finally {
        setIsUploadingLogo(false);
      }
    },
    [uploadPreparedLogoToServer]
  );

  const handleRemoveLogo = useCallback(() => {
    setLogoError(null);
    logoFileRef.current = null;
    setLogoMeta(null);
  }, []);

  const handleChangeLogoPosition = useCallback((xPct: number, yPct: number) => {
    setLogoConfig((prev) => ({
      ...prev,
      position: 'custom',
      xPct,
      yPct,
    }));
  }, []);

  const handleChangeTextLogoPosition = useCallback((xPct: number, yPct: number) => {
    setTextLogoConfig((prev) => ({
      ...prev,
      xPct,
      yPct,
    }));
  }, []);

  const handleInspectVideoLink = useCallback(async () => {
    const trimmed = extractFirstHttpUrl(downloaderUrl);
    if (!trimmed) {
      setLinkDownloadError('Video Link (URL) အရင်ထည့်ပေးပါ။');
      return;
    }
    if (trimmed !== downloaderUrl) {
      setDownloaderUrl(trimmed);
    }
    if (isOwnAppUrl(trimmed)) {
      setInspectedLinkInfo(null);
      setLinkDownloadError(
        'ဤ Link သည် Myanmar MV Studio App ၏ Link ဖြစ်နေပါသည် — ကျေးဇူးပြု၍ TikTok, Facebook, Instagram သို့မဟုတ် MP4 Video Link အစစ်ကို ထည့်ပေးပါ။'
      );
      return;
    }

    setLinkDownloadError(null);
    setCookieAuthNeeded(false);
    setIsInspectingLink(true);
    try {
      const res = await resilientFetch(
        '/api/video-downloader/inspect',
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmed }),
        },
        45_000,
        'Video Link စစ်ဆေးချိန် ကြာမြင့်နေပါသည်။ ထပ်မံကြိုးစားပေးပါ။'
      );
      const data = await parseApiResponse<InspectedVideoLinkInfo>(res);
      setInspectedLinkInfo(data);
    } catch (err) {
      if (err instanceof CookieCheckError) {
        setCookieAuthNeeded(true);
      }
      setInspectedLinkInfo(null);
      setLinkDownloadError(
        err instanceof Error
          ? err.message
          : 'Video Link စစ်ဆေးရာတွင် အမှားဖြစ်ပွားပါသည်။'
      );
    } finally {
      setIsInspectingLink(false);
    }
  }, [downloaderUrl]);

  const handleDownloadVideoFromLink = useCallback(async () => {
    const trimmed = extractFirstHttpUrl(downloaderUrl);
    if (!trimmed) {
      setLinkDownloadError('Video Link (URL) အရင်ထည့်ပေးပါ။');
      return;
    }
    if (trimmed !== downloaderUrl) {
      setDownloaderUrl(trimmed);
    }
    if (isOwnAppUrl(trimmed)) {
      setInspectedLinkInfo(null);
      setLinkDownloadError(
        'ဤ Link သည် Myanmar MV Studio App ၏ Link ဖြစ်နေပါသည် — ကျေးဇူးပြု၍ TikTok, Facebook, Instagram သို့မဟုတ် MP4 Video Link အစစ်ကို ထည့်ပေးပါ။'
      );
      return;
    }

    setLinkDownloadError(null);
    setCookieAuthNeeded(false);
    setIsDownloadingLink(true);
    try {
      const res = await resilientFetch(
        '/api/video-downloader/download',
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: trimmed,
            quality: downloaderQuality,
          }),
        },
        240_000,
        'Video ဒေါင်းယူချိန် ကြာမြင့်နေပါသည်။ 480p သို့မဟုတ် 720p ပြောင်းရွေးပြီး ထပ်စမ်းကြည့်ပါ။'
      );
      const item = await parseApiResponse<DownloadedVideoItem>(res);
      setDownloadedItems((prev) => [item, ...prev.filter((p) => p.downloadId !== item.downloadId)]);
      setInspectedLinkInfo({
        url: item.sourceUrl,
        title: item.title,
        platform: item.platform,
        durationSec: item.durationSec,
      });
    } catch (err) {
      if (err instanceof CookieCheckError) {
        setCookieAuthNeeded(true);
      }
      setLinkDownloadError(
        err instanceof Error
          ? err.message
          : 'Video Link မှ ဒေါင်းယူရာတွင် အမှားဖြစ်ပွားပါသည်။'
      );
    } finally {
      setIsDownloadingLink(false);
    }
  }, [downloaderUrl, downloaderQuality]);

  const handleSaveDownloadedFile = useCallback(async (item: DownloadedVideoItem) => {
    setLinkDownloadError(null);
    setSavingDownloadId(item.downloadId);
    setSavingDownloadProgress(0);
    try {
      const blob = await fetchVideoBlobInChunks(
        item.downloadUrl,
        item.sizeBytes,
        setSavingDownloadProgress
      );
      triggerBlobDownload(blob, item.filename);
    } catch (err) {
      if (err instanceof CookieCheckError) {
        setCookieAuthNeeded(true);
        setLinkDownloadError(err.message);
      } else {
        triggerDirectDownload(item.downloadUrl, item.filename);
      }
    } finally {
      setSavingDownloadId(null);
      setSavingDownloadProgress(null);
    }
  }, []);

  const handleShareDownloadedFile = useCallback(async (item: DownloadedVideoItem) => {
    if (item.sizeBytes > 150 * 1024 * 1024) {
      setLinkDownloadError(
        'ဖိုင်အရွယ်အစား 150 MB ထက် ကြီးသောကြောင့် "Video ဖုန်းထဲ Save မည်" ခလုတ်ဖြင့် ဒေါင်းလုဒ်ဆွဲပါ။'
      );
      return;
    }

    setLinkDownloadError(null);
    setSavingDownloadId(item.downloadId);
    setSavingDownloadProgress(0);
    try {
      const blob = await fetchVideoBlobInChunks(
        item.downloadUrl,
        item.sizeBytes,
        setSavingDownloadProgress
      );
      const safeName = item.isAudioOnly
        ? 'downloaded_audio.mp3'
        : getAsciiSafeMp4Filename(item.filename);
      const file = new File([blob], safeName, { type: item.mimeType || 'video/mp4' });
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: item.title || safeName,
        });
      } else {
        triggerBlobDownload(blob, safeName);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      if (err instanceof CookieCheckError) {
        setCookieAuthNeeded(true);
        setLinkDownloadError(err.message);
      } else {
        triggerDirectDownload(item.downloadUrl, item.filename);
      }
    } finally {
      setSavingDownloadId(null);
      setSavingDownloadProgress(null);
    }
  }, []);

  const handleUseDownloadedInStudio = useCallback(
    async (item: DownloadedVideoItem) => {
      if (item.isAudioOnly) return;
      setLinkDownloadError(null);
      setCookieAuthNeeded(false);
      setLoadingToStudioId(item.downloadId);
      try {
        const res = await resilientFetch(
          '/api/video-downloader/use-in-studio',
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ downloadId: item.downloadId }),
          },
          45_000,
          'Studio ထဲသို့ ဗီဒီယိုထည့်ချိန် ကြာမြင့်နေပါသည်။'
        );
        const meta = await parseApiResponse<StudioVideoMeta>(res);
        const videoBlob = await fetchVideoBlobInChunks(item.downloadUrl, item.sizeBytes);
        const safeName = getAsciiSafeMp4Filename(meta.filename);
        const localFile = new File([videoBlob], safeName, {
          type: meta.mimeType || 'video/mp4',
        });
        selectedFileRef.current = localFile;

        if (localVideoUrl) {
          URL.revokeObjectURL(localVideoUrl);
        }
        const nextUrl = URL.createObjectURL(videoBlob);
        setLocalVideoUrl(nextUrl);
        setVideoMeta(meta);
        setUploadError(null);
        setGenerateError(null);
        setRenderError(null);
        setVideoDuration(item.durationSec ?? 0);
        setRangeStartInput('00:00');
        setRangeEndInput('');
        setRenderResult((prev) => {
          if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl);
          return null;
        });
        setActiveMonitorTab('preview');
        setViewMode('editor');
        setOpenToolId('ai_subtitle');
        setTimeout(() => {
          monitorSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      } catch (err) {
        if (err instanceof CookieCheckError) {
          setCookieAuthNeeded(true);
        }
        setLinkDownloadError(
          err instanceof Error
            ? err.message
            : 'Studio ထဲသို့ ဗီဒီယိုထည့်ရာတွင် အမှားဖြစ်ပွားပါသည်။'
        );
      } finally {
        setLoadingToStudioId(null);
      }
    },
    [localVideoUrl]
  );

  const handleRenderVideo = useCallback(async () => {
    if (isUploading) {
      setRenderError('ဗီဒီယို Server သို့ တင်နေဆဲဖြစ်ပါသည်။ ခေတ္တစောင့်ပေးပါ။');
      return;
    }
    if (!videoMeta?.videoId && !selectedFileRef.current) {
      setRenderError('ကျေးဇူးပြု၍ ဗီဒီယိုဖိုင် အရင်တင်ပေးပါ။');
      return;
    }

    setRenderError(null);
    setCookieAuthNeeded(false);
    setOpenToolId('export');
    setIsRendering(true);
    try {
      let activeVideoId = videoMeta?.videoId;
      if (!activeVideoId && selectedFileRef.current) {
        const reuploaded = await uploadFileToServer(selectedFileRef.current);
        activeVideoId = reuploaded.videoId;
      }

      let activeLogoId = logoMeta?.logoId;

      const executeRender = async (
        targetVideoId: string,
        targetLogoId: string | undefined
      ) => {
        const res = await resilientFetch(
          '/api/videos/render',
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              videoId: targetVideoId,
              srtText,
              colorPresetId,
              brightness,
              contrast,
              saturation,
              fontName,
              fontSize,
              textColorId,
              positionId,
              subtitleX,
              subtitleY,
              subtitleAnimation,
              videoAspectId,
              videoFitMode,
              logo:
                targetLogoId && logoConfig.enabled
                  ? {
                      logoId: targetLogoId,
                      enabled: true,
                      position: logoConfig.position,
                      xPct: logoConfig.xPct,
                      yPct: logoConfig.yPct,
                      scalePct: logoConfig.scalePct,
                      opacity: logoConfig.opacity,
                      marginPct: logoConfig.marginPct,
                      animation: logoConfig.animation,
                    }
                  : undefined,
              textLogo:
                textLogoConfig.enabled && textLogoConfig.text.trim().length > 0
                  ? {
                      enabled: true,
                      text: textLogoConfig.text.trim(),
                      styleId: textLogoConfig.styleId,
                      colorId: textLogoConfig.colorId,
                      animationId: textLogoConfig.animationId,
                      xPct: textLogoConfig.xPct,
                      yPct: textLogoConfig.yPct,
                      size: textLogoConfig.size,
                      opacity: textLogoConfig.opacity,
                    }
                  : undefined,
            }),
          },
          240_000,
          'MP4 Render လုပ်ချိန် ကြာမြင့်နေပါသည်။ ထပ်မံကြိုးစားပေးပါ။'
        );
        return await parseApiResponse<RenderResult>(res);
      };

      let data: RenderResult;
      try {
        data = await executeRender(activeVideoId!, activeLogoId);
      } catch (firstErr) {
        const errMsg = firstErr instanceof Error ? firstErr.message : '';
        let retried = false;
        if (errMsg.includes('အရင်တင်ပေးပါ') && selectedFileRef.current) {
          const reuploaded = await uploadFileToServer(selectedFileRef.current);
          activeVideoId = reuploaded.videoId;
          retried = true;
        }
        if (errMsg.includes('Logo ဖိုင်') && logoFileRef.current) {
          const reuploadedLogo = await uploadPreparedLogoToServer(logoFileRef.current);
          activeLogoId = reuploadedLogo.logoId;
          setLogoMeta((prev) => (prev ? { ...prev, logoId: reuploadedLogo.logoId } : prev));
          retried = true;
        }
        if (retried) {
          data = await executeRender(activeVideoId!, activeLogoId);
        } else {
          throw firstErr;
        }
      }

      if (!data.renderId) {
        throw new Error('ဗီဒီယို Render ထုတ်ရာတွင် အမှားဖြစ်ပွားပါသည်။');
      }

      setRenderResult((prev) => {
        if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl);
        return data;
      });
      setActiveMonitorTab('rendered');

      if (data.sizeBytes <= 28 * 1024 * 1024) {
        fetchVideoBlobInChunks(data.videoUrl, data.sizeBytes)
          .then((videoBlob) => {
            const nextBlobUrl = URL.createObjectURL(videoBlob);
            setRenderResult((prev) => {
              if (!prev || prev.renderId !== data.renderId) {
                URL.revokeObjectURL(nextBlobUrl);
                return prev;
              }
              return { ...prev, blobUrl: nextBlobUrl };
            });
          })
          .catch(() => {
            // Will download on-demand via chunked Range fetch when user clicks Download
          });
      }
    } catch (err) {
      if (err instanceof CookieCheckError) {
        setCookieAuthNeeded(true);
      }
      setRenderError(
        err instanceof Error ? err.message : 'FFmpeg Render လုပ်ရာတွင် အမှားဖြစ်ပွားပါသည်။'
      );
    } finally {
      setIsRendering(false);
    }
  }, [
    isUploading,
    videoMeta,
    uploadFileToServer,
    uploadPreparedLogoToServer,
    srtText,
    colorPresetId,
    brightness,
    contrast,
    saturation,
    fontName,
    fontSize,
    textColorId,
    positionId,
    subtitleX,
    subtitleY,
    subtitleAnimation,
    videoAspectId,
    videoFitMode,
    logoMeta,
    logoConfig,
    textLogoConfig,
  ]);

  const handleDownloadMp4 = useCallback(async () => {
    if (!renderResult) return;
    setRenderError(null);

    if (renderResult.blobUrl) {
      triggerObjectUrlDownload(renderResult.blobUrl, renderResult.filename);
      return;
    }

    setIsDownloadingMp4(true);
    setDownloadProgress(0);
    try {
      const blob = await fetchVideoBlobInChunks(
        renderResult.videoUrl,
        renderResult.sizeBytes,
        setDownloadProgress
      );
      const nextBlobUrl = URL.createObjectURL(blob);
      setRenderResult((prev) =>
        prev && prev.renderId === renderResult.renderId
          ? { ...prev, blobUrl: nextBlobUrl }
          : prev
      );
      triggerObjectUrlDownload(nextBlobUrl, renderResult.filename);
    } catch (err) {
      if (err instanceof CookieCheckError) {
        setCookieAuthNeeded(true);
        setRenderError(err.message);
      } else {
        triggerDirectDownload(renderResult.videoUrl, renderResult.filename);
      }
    } finally {
      setIsDownloadingMp4(false);
      setDownloadProgress(null);
    }
  }, [renderResult]);

  const canShareMp4 = useMemo(() => {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function'
    );
  }, []);

  const handleShareMp4 = useCallback(async () => {
    if (!renderResult) return;
    if (renderResult.sizeBytes > 150 * 1024 * 1024) {
      setRenderError(
        'ဖိုင်အရွယ်အစား 150 MB ထက် ကြီးသောကြောင့် "Download MP4" ခလုတ်ဖြင့် ဒေါင်းလုဒ်ဆွဲပါ။'
      );
      return;
    }

    setRenderError(null);
    setIsDownloadingMp4(true);
    setDownloadProgress(0);
    try {
      let blob: Blob;
      if (renderResult.blobUrl) {
        const res = await fetch(renderResult.blobUrl);
        blob = await res.blob();
      } else {
        blob = await fetchVideoBlobInChunks(
          renderResult.videoUrl,
          renderResult.sizeBytes,
          setDownloadProgress
        );
        const nextBlobUrl = URL.createObjectURL(blob);
        setRenderResult((prev) =>
          prev && prev.renderId === renderResult.renderId
            ? { ...prev, blobUrl: nextBlobUrl }
            : prev
        );
      }

      const safeFilename = getAsciiSafeMp4Filename(renderResult.filename);
      const file = new File([blob], safeFilename, { type: 'video/mp4' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: safeFilename,
        });
      } else {
        triggerObjectUrlDownload(
          renderResult.blobUrl || URL.createObjectURL(blob),
          safeFilename
        );
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      if (err instanceof CookieCheckError) {
        setCookieAuthNeeded(true);
        setRenderError(err.message);
      } else {
        triggerDirectDownload(renderResult.videoUrl, renderResult.filename);
      }
    } finally {
      setIsDownloadingMp4(false);
      setDownloadProgress(null);
    }
  }, [renderResult]);

  const handleDownloadSrt = useCallback(async () => {
    if (!renderResult?.srtUrl) return;
    try {
      const blob = await fetchAuthenticatedBlob(renderResult.srtUrl);
      triggerBlobDownload(blob, 'subtitles.srt');
    } catch {
      if (srtText.trim()) {
        const fallbackBlob = new Blob([srtText.trim() + '\n'], {
          type: 'text/plain;charset=utf-8',
        });
        triggerBlobDownload(fallbackBlob, 'subtitles.srt');
      }
    }
  }, [renderResult, srtText]);

  const handleSeekHandled = useCallback(() => {
    setSeekRequestTime(null);
  }, []);

  const handleResetAdjustments = useCallback(() => {
    setBrightness(0.0);
    setContrast(1.0);
    setSaturation(1.0);
  }, []);

  const triggerPositionGuide = useCallback(() => {
    setActiveMonitorTab('preview');
    setShowPositionGuide(true);
    if (positionGuideTimerRef.current) {
      clearTimeout(positionGuideTimerRef.current);
    }
    positionGuideTimerRef.current = setTimeout(() => {
      setShowPositionGuide(false);
    }, 3500);
  }, []);

  const handleSelectPositionPreset = useCallback(
    (pid: SubtitlePositionId) => {
      const spec = SUBTITLE_POSITIONS[pid];
      setPositionId(pid);
      if (spec) {
        setSubtitleX(spec.xPct);
        setSubtitleY(spec.yPct);
      }
      triggerPositionGuide();
    },
    [triggerPositionGuide]
  );

  const handleChangeSubtitlePosition = useCallback(
    (xPct: number, yPct: number) => {
      setSubtitleX(xPct);
      setSubtitleY(yPct);
      setPositionId('custom');
      triggerPositionGuide();
    },
    [triggerPositionGuide]
  );

  const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleToggleTool = useCallback((toolId: StudioToolId) => {
    setOpenToolId((prev) => (prev === toolId ? null : toolId));
  }, []);

  const jumpToTool = useCallback((toolId: GuideToolTargetId) => {
    if (toolId === 'video_downloader') {
      setViewMode('downloader');
      return;
    }
    setViewMode('editor');
    setOpenToolId(toolId);
    setTimeout(() => scrollToSection(toolsSectionRef), 60);
  }, []);

  const openEditor = useCallback((initialTool: StudioToolId | null = 'ai_subtitle') => {
    setViewMode('editor');
    if (initialTool !== undefined) {
      setOpenToolId(initialTool);
    }
  }, []);

  const openDownloader = useCallback(() => {
    setViewMode('downloader');
  }, []);

  const shareableUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    if (origin.includes('ais-dev-')) {
      return origin.replace('ais-dev-', 'ais-pre-');
    }
    return origin;
  }, []);

  const handleCopyShareLink = useCallback(async () => {
    if (!shareableUrl) return;
    try {
      await navigator.clipboard.writeText(shareableUrl);
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 2200);
    } catch {
      const input = document.createElement('input');
      input.value = shareableUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 2200);
    }
  }, [shareableUrl]);

  const cookieBanner = cookieAuthNeeded ? (
    <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <p className="text-xs text-amber-200 leading-relaxed">
        {isEmbeddedIframe()
          ? 'AI Studio Preview box အတွင်း၌ Chrome သည် Security Cookie ကို ပိတ်ထားတတ်ပါသည်။ "Chrome Tab အသစ်တွင် ဖွင့်မည်" ကို နှိပ်၍ Tab အသစ်တွင် ဖွင့်သုံးပေးပါ။'
          : isInAppBrowser()
          ? 'Facebook / Messenger App အတွင်းမှ ဖွင့်ထားပါက Video တင်မရပါ။ ညာဘက်အပေါ် ⋮ မှ "Open in Chrome / External Browser" ဖြင့် ဖွင့်သုံးပေးပါ။'
          : 'Google Login / Security Cookie သက်တမ်းကုန်သွားပါသည်။ ခလုတ်ကိုနှိပ်၍ Security ပြန်ချိတ်ဆက်ပြီးမှ Video တင်ပေးပါ (တခြားသူများ သုံးမရလျှင် ဖြေရှင်းနည်းကိုလည်း ကြည့်နိုင်ပါသည်)။'}
      </p>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {isEmbeddedIframe() && canRequestStorageAccess() && (
          <button
            type="button"
            onClick={handleUnlockPreviewCookies}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
          >
            Preview ထဲတွင် ခွင့်ပြုချက်စမ်းမည်
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowGuestShareHelp(true)}
          className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
        >
          အများသုံးနည်း
        </button>
        <a
          href={`${getSessionRefreshHref()}?ts=${Date.now()}`}
          target={isEmbeddedIframe() || isInAppBrowser() ? '_blank' : undefined}
          rel={isEmbeddedIframe() || isInAppBrowser() ? 'noopener noreferrer' : undefined}
          className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold whitespace-nowrap shrink-0 text-center"
        >
          {isEmbeddedIframe()
            ? 'Chrome Tab အသစ်တွင် ဖွင့်မည်'
            : isInAppBrowser()
            ? 'Chrome / Browser ဖြင့် ဖွင့်မည်'
            : 'Security / Login ပြန်ချိတ်ဆက်မည်'}
        </a>
      </div>
    </div>
  ) : null;

  const inAppBrowserBanner =
    !cookieAuthNeeded && isInAppBrowser() ? (
      <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-sky-200 leading-relaxed">
          Facebook / Messenger App အတွင်းမှ ဖွင့်ထားပါက ဗီဒီယိုထည့်ခြင်းနှင့် Download မရနိုင်ပါ။ ညာဘက်အပေါ် ⋮ မှ{' '}
          <span className="font-semibold text-white">Open in Chrome / Safari</span> ဖြင့် ဖွင့်သုံးပေးပါ။
        </p>
        <button
          type="button"
          onClick={() => setShowGuestShareHelp(true)}
          className="px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
        >
          ဖွင့်သုံးနည်း ကြည့်မည်
        </button>
      </div>
    ) : null;

  if (viewMode === 'hub') {
    return (
      <>
        {(cookieBanner || inAppBrowserBanner) && (
          <div className="bg-[#080B12] px-4 sm:px-6 pt-3 max-w-5xl mx-auto space-y-2">
            {cookieBanner}
            {inAppBrowserBanner}
          </div>
        )}
        <StudioHomeHub
          hasVideo={Boolean(videoMeta || localVideoUrl)}
          videoFilename={videoMeta?.filename || selectedFileRef.current?.name}
          cuesCount={cues.length}
          copiedShareLink={copiedShareLink}
          onCopyShareLink={handleCopyShareLink}
          onOpenEditor={openEditor}
          onOpenDownloader={openDownloader}
          onOpenToolsGuide={() => setShowToolsGuide(true)}
          onOpenGuestShareHelp={() => setShowGuestShareHelp(true)}
        />
        <ToolsGuideModal
          isOpen={showToolsGuide}
          onClose={() => setShowToolsGuide(false)}
          onSelectTool={(toolId) => jumpToTool(toolId)}
        />
        <GuestShareHelpModal
          isOpen={showGuestShareHelp}
          onClose={() => setShowGuestShareHelp(false)}
          shareableUrl={shareableUrl}
          copiedShareLink={copiedShareLink}
          onCopyShareLink={handleCopyShareLink}
        />
        <OfflineIndicator />
      </>
    );
  }

  if (viewMode === 'downloader') {
    return (
      <>
        <StandaloneVideoDownloaderView
          urlInput={downloaderUrl}
          onChangeUrlInput={setDownloaderUrl}
          qualityId={downloaderQuality}
          onChangeQuality={setDownloaderQuality}
          inspectedInfo={inspectedLinkInfo}
          isInspecting={isInspectingLink}
          isDownloadingLink={isDownloadingLink}
          downloadError={linkDownloadError}
          cookieAuthNeeded={cookieAuthNeeded}
          downloadedItems={downloadedItems}
          savingItemId={savingDownloadId}
          savingProgress={savingDownloadProgress}
          loadingToStudioId={loadingToStudioId}
          canShareFile={canShareMp4}
          onInspectLink={handleInspectVideoLink}
          onDownloadFromLink={handleDownloadVideoFromLink}
          onSaveDownloadedFile={handleSaveDownloadedFile}
          onShareDownloadedFile={handleShareDownloadedFile}
          onUseDownloadedInStudio={handleUseDownloadedInStudio}
          onBackHome={() => setViewMode('hub')}
          onOpenStudio={() => openEditor('ai_subtitle')}
          cookieBanner={cookieBanner}
          inAppBrowserBanner={inAppBrowserBanner}
        />
        <ToolsGuideModal
          isOpen={showToolsGuide}
          onClose={() => setShowToolsGuide(false)}
          onSelectTool={(toolId) => jumpToTool(toolId)}
        />
        <GuestShareHelpModal
          isOpen={showGuestShareHelp}
          onClose={() => setShowGuestShareHelp(false)}
          shareableUrl={shareableUrl}
          copiedShareLink={copiedShareLink}
          onCopyShareLink={handleCopyShareLink}
        />
        <OfflineIndicator />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#080B12] text-slate-100 flex flex-col">
      {/* Compact Studio Editor Top Bar (with flowing light ribbon) */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#080B12]/95 backdrop-blur-md relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden"
        >
          <div className="h-full mv-toolstrip-ribbon" />
        </div>
        <div className="max-w-[1440px] mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setViewMode('hub')}
              aria-label="Back to Home Hub"
              className="w-10 h-10 rounded-xl bg-[#0F1420] border border-slate-800 hover:border-slate-700 text-slate-200 hover:text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <img
              src={APP_BRAND_LOGO_URL}
              alt="Myanmar MV Studio Logo"
              className="w-9 h-9 rounded-xl object-contain bg-white p-0.5 border border-amber-400/60 shrink-0"
            />
            <h1 className="font-display text-sm sm:text-base font-bold tracking-tight text-slate-100 truncate">
              စတူဒီယို တည်းဖြတ်ခန်း
            </h1>
          </div>

          <nav
            aria-label="Editor quick tools"
            className="hidden lg:flex items-center gap-5 text-xs font-medium text-slate-400"
          >
            <button
              type="button"
              onClick={() => jumpToTool('ai_subtitle')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              AI Subtitles
            </button>
            <button
              type="button"
              onClick={() => jumpToTool('color')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Color Grade
            </button>
            <button
              type="button"
              onClick={() => jumpToTool('subtitle_style')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Myanmar Fonts
            </button>
            <button
              type="button"
              onClick={() => jumpToTool('logo')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Logo
            </button>
            <button
              type="button"
              onClick={() => setShowToolsGuide(true)}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>လမ်းညွှန်</span>
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRenderVideo}
              disabled={(!videoMeta && !localVideoUrl) || isUploading || isRendering}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isRendering ? 'ထုတ်ယူနေသည်...' : 'ဗီဒီယို ထုတ်ယူမည်'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Studio Workspace */}
      <main id="top" className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-6 py-4 space-y-4">
        {cookieBanner}
        {inAppBrowserBanner}

        {/* Two-Column Editing Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Dominant Anchor: Video Monitor */}
          <div ref={monitorSectionRef} className="lg:col-span-7 lg:sticky lg:top-20 min-w-0">
            <VideoMonitor
              localVideoUrl={localVideoUrl}
              videoMeta={videoMeta}
              isUploading={isUploading}
              uploadProgress={uploadProgress}
              uploadError={uploadError}
              onSelectFile={handleSelectFile}
              onRetryUpload={handleRetryUpload}
              cues={cues}
              seekRequestTime={seekRequestTime}
              onSeekHandled={handleSeekHandled}
              onTimeUpdateExternal={setCurrentTime}
              onDurationChangeExternal={setVideoDuration}
              colorPresetId={colorPresetId}
              brightness={brightness}
              contrast={contrast}
              saturation={saturation}
              fontName={fontName}
              fontSize={fontSize}
              textColorId={textColorId}
              positionId={positionId}
              subtitleX={subtitleX}
              subtitleY={subtitleY}
              onChangeSubtitlePosition={handleChangeSubtitlePosition}
              showPositionGuide={showPositionGuide}
              subtitleAnimation={subtitleAnimation}
              videoAspectId={videoAspectId}
              videoFitMode={videoFitMode}
              cookieAuthNeeded={cookieAuthNeeded}
              onUnlockPreviewCookies={handleUnlockPreviewCookies}
              logoMeta={logoMeta}
              logoConfig={logoConfig}
              onChangeLogoPosition={handleChangeLogoPosition}
              textLogoConfig={textLogoConfig}
              onChangeTextLogoPosition={handleChangeTextLogoPosition}
              renderResult={renderResult}
              activeMonitorTab={activeMonitorTab}
              onChangeMonitorTab={setActiveMonitorTab}
            />
          </div>

          {/* Right Panel: On-Demand Tap-to-Expand Studio Tools */}
          <div ref={toolsSectionRef} className="lg:col-span-5 min-w-0">
            <StudioToolDeck
              hasVideo={Boolean(videoMeta)}
              hasLocalVideo={Boolean(localVideoUrl)}
              isUploading={isUploading}
              uploadProgress={uploadProgress}
              uploadError={uploadError}
              cookieAuthNeeded={cookieAuthNeeded}
              onRetryUpload={handleRetryUpload}
              openToolId={openToolId}
              onToggleTool={handleToggleTool}
              onOpenTool={setOpenToolId}
              modeId={modeId}
              onChangeMode={setModeId}
              modelId={modelId}
              onChangeModel={setModelId}
              translationScope={translationScope}
              onChangeTranslationScope={setTranslationScope}
              rangeStartInput={rangeStartInput}
              onChangeRangeStartInput={setRangeStartInput}
              rangeEndInput={rangeEndInput}
              onChangeRangeEndInput={setRangeEndInput}
              mergeRangeIntoExisting={mergeRangeIntoExisting}
              onChangeMergeRangeIntoExisting={setMergeRangeIntoExisting}
              customPrompt={customPrompt}
              onChangeCustomPrompt={setCustomPrompt}
              videoDuration={videoDuration}
              isGenerating={isGenerating}
              generateError={generateError}
              onGenerateSubtitles={handleGenerateSubtitles}
              srtText={srtText}
              onChangeSrtText={setSrtText}
              cues={cues}
              currentTime={currentTime}
              isTranslatingSrt={isTranslatingSrt}
              onTranslateExistingSrt={handleTranslateExistingSrt}
              onSeekTo={(sec) => {
                setActiveMonitorTab('preview');
                setSeekRequestTime(sec);
              }}
              colorPresetId={colorPresetId}
              onChangeColorPreset={setColorPresetId}
              brightness={brightness}
              onChangeBrightness={setBrightness}
              contrast={contrast}
              onChangeContrast={setContrast}
              saturation={saturation}
              onChangeSaturation={setSaturation}
              onResetAdjustments={handleResetAdjustments}
              fontName={fontName}
              onChangeFontName={setFontName}
              fontSize={fontSize}
              onChangeFontSize={setFontSize}
              textColorId={textColorId}
              onChangeTextColor={setTextColorId}
              positionId={positionId}
              onChangePosition={handleSelectPositionPreset}
              subtitleX={subtitleX}
              subtitleY={subtitleY}
              onChangeSubtitlePosition={handleChangeSubtitlePosition}
              onShowPositionGuide={triggerPositionGuide}
              subtitleAnimation={subtitleAnimation}
              onChangeSubtitleAnimation={setSubtitleAnimation}
              logoMeta={logoMeta}
              logoConfig={logoConfig}
              textLogoConfig={textLogoConfig}
              isUploadingLogo={isUploadingLogo}
              logoError={logoError}
              onUploadLogoFile={handleUploadLogoFile}
              onChangeLogoConfig={setLogoConfig}
              onChangeTextLogoConfig={setTextLogoConfig}
              onRemoveLogo={handleRemoveLogo}
              videoAspectId={videoAspectId}
              onChangeVideoAspect={setVideoAspectId}
              videoFitMode={videoFitMode}
              onChangeVideoFitMode={setVideoFitMode}
              isRendering={isRendering}
              isDownloadingMp4={isDownloadingMp4}
              downloadProgress={downloadProgress}
              renderError={renderError}
              renderResult={renderResult}
              onRenderVideo={handleRenderVideo}
              onDownloadMp4={handleDownloadMp4}
              onShareMp4={handleShareMp4}
              canShareMp4={canShareMp4}
              onDownloadSrt={handleDownloadSrt}
              onPreviewRendered={() => {
                setActiveMonitorTab('rendered');
                scrollToSection(monitorSectionRef);
              }}
            />
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-800/70 bg-[#080B12]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400">
          <span>
            Myanmar MV Studio — တစ်စုံတစ်ရာ အဆင်မပြေမှု သို့မဟုတ် အကြံပြုချက်ရှိပါက ဆက်သွယ်ပြောပြနိုင်ပါသည်။
          </span>
          <a
            href={CREATOR_FACEBOOK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sky-400 hover:text-sky-300 font-medium whitespace-nowrap shrink-0"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Facebook မှ ဆက်သွယ်ရန်</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </footer>

      <ToolsGuideModal
        isOpen={showToolsGuide}
        onClose={() => setShowToolsGuide(false)}
        onSelectTool={(toolId) => jumpToTool(toolId)}
      />

      <GuestShareHelpModal
        isOpen={showGuestShareHelp}
        onClose={() => setShowGuestShareHelp(false)}
        shareableUrl={shareableUrl}
        copiedShareLink={copiedShareLink}
        onCopyShareLink={handleCopyShareLink}
      />

      <OfflineIndicator />
    </div>
  );
}
