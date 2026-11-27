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
  extractFirstHttpUrl,
  getAsciiSafeMediaFilename,
  isInAppBrowser,
  isOwnAppUrl,
  triggerBlobDownload,
  triggerDirectDownload,
  triggerObjectUrlDownload,
} from './lib/api';
import { exportVideoInBrowser } from './lib/clientCanvasExport';
import {
  downloadVideoLinkClient,
  inspectVideoLinkClient,
} from './lib/clientDownloader';
import {
  generateSubtitlesClient,
  getStoredGeminiApiKey,
  saveStoredGeminiApiKey,
  translateSrtClient,
} from './lib/clientGemini';
import { prepareLogoFileForUpload } from './lib/logoMaker';
import {
  mergeSrtCues,
  parseFlexInputTime,
  parseSrt,
  serializeSrt,
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

type AppViewMode = 'hub' | 'editor' | 'downloader';

function getViewModeFromLocation(): AppViewMode {
  if (typeof window === 'undefined') return 'hub';
  try {
    const pathname = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
    const viewParam = new URLSearchParams(window.location.search).get('view')?.toLowerCase();
    if (
      pathname === '/downloader' ||
      pathname === '/video-downloader' ||
      viewParam === 'downloader'
    ) {
      return 'downloader';
    }
    if (
      pathname === '/studio' ||
      pathname === '/editor' ||
      viewParam === 'studio' ||
      viewParam === 'editor'
    ) {
      return 'editor';
    }
  } catch {
    // Ignore location parse errors
  }
  return 'hub';
}

export default function App() {
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [videoMeta, setVideoMeta] = useState<StudioVideoMeta | null>(null);

  const [viewMode, setViewMode] = useState<AppViewMode>(() => getViewModeFromLocation());
  const [openToolId, setOpenToolId] = useState<StudioToolId | null>('ai_subtitle');

  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => getStoredGeminiApiKey());
  const [modeId, setModeId] = useState<SubtitleModeId>('english_to_burmese');
  const [modelId, setModelId] = useState<GeminiModelId>('gemini-3.5-flash-lite');
  const [translationScope, setTranslationScope] = useState<'full' | 'range'>('full');
  const [rangeStartInput, setRangeStartInput] = useState('00:00');
  const [rangeEndInput, setRangeEndInput] = useState('');
  const [mergeRangeIntoExisting, setMergeRangeIntoExisting] = useState(true);
  const [customPrompt, setCustomPrompt] = useState('');
  const [videoDuration, setVideoDuration] = useState(0);
  const [srtText, setSrtText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgressText, setGenerateProgressText] = useState<string | null>(null);
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
  const [renderProgress, setRenderProgress] = useState<number | null>(null);
  const [isDownloadingMp4, setIsDownloadingMp4] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);
  const [activeMonitorTab, setActiveMonitorTab] = useState<'preview' | 'rendered'>('preview');
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [showToolsGuide, setShowToolsGuide] = useState(false);
  const [showGuestShareHelp, setShowGuestShareHelp] = useState(false);

  const [currentTime, setCurrentTime] = useState(0);
  const [seekRequestTime, setSeekRequestTime] = useState<number | null>(null);

  const monitorSectionRef = useRef<HTMLDivElement | null>(null);
  const toolsSectionRef = useRef<HTMLDivElement | null>(null);
  const selectedFileRef = useRef<File | null>(null);
  const positionGuideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cues = useMemo(() => parseSrt(srtText), [srtText]);

  const navigateView = useCallback((nextMode: AppViewMode) => {
    setViewMode(nextMode);
    if (typeof window === 'undefined') return;
    try {
      const targetPath =
        nextMode === 'downloader'
          ? '/downloader'
          : nextMode === 'editor'
          ? '/studio'
          : '/';
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ viewMode: nextMode }, '', targetPath);
      }
    } catch {
      // Ignore history API restrictions
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setViewMode(getViewModeFromLocation());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
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

  const handleSaveGeminiApiKey = useCallback((nextKey: string) => {
    const saved = saveStoredGeminiApiKey(nextKey);
    setGeminiApiKey(saved);
    if (saved) {
      setGenerateError(null);
    }
  }, []);

  const handleSelectFile = useCallback(
    (file: File) => {
      if (file.size === 0) {
        setRenderError('ရွေးချယ်ထားသော ဗီဒီယိုဖိုင် အလွတ်ဖြစ်နေပါသည် (0 bytes)။');
        return;
      }

      selectedFileRef.current = file;
      setGenerateError(null);
      setRenderError(null);
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
      setVideoMeta({
        videoId: `local_${Date.now()}`,
        filename: file.name,
        sizeBytes: file.size,
        mimeType: file.type || 'video/mp4',
      });
    },
    [localVideoUrl]
  );

  const handleGenerateSubtitles = useCallback(async () => {
    const activeFile = selectedFileRef.current;
    if (!activeFile) {
      setGenerateError('ကျေးဇူးပြု၍ ဗီဒီယိုဖိုင် အရင်ရွေးချယ်ထည့်ပေးပါ။');
      return;
    }

    const activeApiKey = geminiApiKey.trim() || getStoredGeminiApiKey();
    if (!activeApiKey) {
      setGenerateError(
        'AI စာတန်းထိုးထုတ်ရန် အပေါ်ရှိ Gemini API Key အကွက်တွင် Key ထည့်သွင်းပြီး Save နှိပ်ပေးပါ။'
      );
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
    setGenerateProgressText('အသံဖိုင်ခွဲထုတ်နေပါသည်...');
    setIsGenerating(true);
    try {
      const data = await generateSubtitlesClient({
        apiKey: activeApiKey,
        file: activeFile,
        mode: modeId,
        model: modelId,
        startSec,
        endSec,
        customPrompt: customPrompt.trim() || undefined,
        onProgress: setGenerateProgressText,
      });

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
      setGenerateError(
        err instanceof Error ? err.message : 'AI စာတန်းထုတ်ရာတွင် အမှားဖြစ်ပွားပါသည်။'
      );
    } finally {
      setIsGenerating(false);
      setGenerateProgressText(null);
    }
  }, [
    geminiApiKey,
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

    const activeApiKey = geminiApiKey.trim() || getStoredGeminiApiKey();
    if (!activeApiKey) {
      setGenerateError(
        'ဘာသာပြန်ရန် "AI စာတန်း" ထဲတွင် Gemini API Key အရင်ထည့်သွင်းပြီး Save နှိပ်ပေးပါ။'
      );
      return;
    }

    setGenerateError(null);
    setIsTranslatingSrt(true);
    try {
      const translatedSrt = await translateSrtClient({
        apiKey: activeApiKey,
        srtText,
        mode: modeId,
        model: modelId,
        customPrompt: customPrompt.trim() || undefined,
      });
      if (!translatedSrt) {
        throw new Error('AI ထံမှ ဘာသာပြန်စာတန်း မရရှိပါ။');
      }
      setSrtText(translatedSrt);
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : 'AI ဘာသာပြန်ရာတွင် အမှားဖြစ်ပွားပါသည်။'
      );
    } finally {
      setIsTranslatingSrt(false);
    }
  }, [geminiApiKey, srtText, modeId, modelId, customPrompt]);

  const handleUploadLogoFile = useCallback(async (rawFile: File) => {
    setLogoError(null);
    setIsUploadingLogo(true);
    try {
      const prepared = await prepareLogoFileForUpload(rawFile);
      const previewUrl = URL.createObjectURL(prepared);

      setLogoMeta({
        logoId: `local_logo_${Date.now()}`,
        filename: prepared.name,
        sizeBytes: prepared.size,
        mimeType: prepared.type || 'image/png',
        previewUrl,
      });
      setLogoConfig((prev) => ({ ...prev, enabled: true }));
      setActiveMonitorTab('preview');
    } catch (err) {
      setLogoError(
        err instanceof Error ? err.message : 'Logo ထည့်သွင်းရာတွင် အမှားဖြစ်ပွားပါသည်။'
      );
    } finally {
      setIsUploadingLogo(false);
    }
  }, []);

  const handleRemoveLogo = useCallback(() => {
    setLogoError(null);
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
        'ဤ Link သည် Myanmar MV Studio App ၏ Link ဖြစ်နေပါသည် — ကျေးဇူးပြု၍ Direct .mp4 / .mp3 Media Link သို့မဟုတ် Video Link အစစ်ကို ထည့်ပေးပါ။'
      );
      return;
    }

    setLinkDownloadError(null);
    setIsInspectingLink(true);
    try {
      const data = await inspectVideoLinkClient(trimmed);
      setInspectedLinkInfo(data);
    } catch (err) {
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
        'ဤ Link သည် Myanmar MV Studio App ၏ Link ဖြစ်နေပါသည် — ကျေးဇူးပြု၍ Direct .mp4 / .mp3 Media Link သို့မဟုတ် Video Link အစစ်ကို ထည့်ပေးပါ။'
      );
      return;
    }

    setLinkDownloadError(null);
    setIsDownloadingLink(true);
    try {
      const item = await downloadVideoLinkClient(trimmed, downloaderQuality);
      setDownloadedItems((prev) => [
        item,
        ...prev.filter((p) => p.downloadId !== item.downloadId),
      ]);
      setInspectedLinkInfo({
        url: item.sourceUrl,
        title: item.title,
        platform: item.platform,
        durationSec: item.durationSec,
        isDirectFile: true,
      });
    } catch (err) {
      setLinkDownloadError(
        err instanceof Error
          ? err.message
          : 'Video Link မှ ဒေါင်းယူရာတွင် အမှားဖြစ်ပွားပါသည်။'
      );
    } finally {
      setIsDownloadingLink(false);
    }
  }, [downloaderUrl, downloaderQuality]);

  const handleSaveDownloadedFile = useCallback((item: DownloadedVideoItem) => {
    setLinkDownloadError(null);
    setSavingDownloadId(item.downloadId);
    setSavingDownloadProgress(null);
    try {
      if (item.downloadUrl.startsWith('blob:')) {
        triggerObjectUrlDownload(item.downloadUrl, item.filename);
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

    if (!item.downloadUrl.startsWith('blob:')) {
      triggerDirectDownload(item.downloadUrl, item.filename);
      return;
    }

    setLinkDownloadError(null);
    setSavingDownloadId(item.downloadId);
    setSavingDownloadProgress(null);
    try {
      const res = await fetch(item.downloadUrl);
      const blob = await res.blob();
      const safeName = getAsciiSafeMediaFilename(
        item.filename,
        item.isAudioOnly ? '.mp3' : '.mp4'
      );
      const file = new File([blob], safeName, {
        type: item.mimeType || (item.isAudioOnly ? 'audio/mpeg' : 'video/mp4'),
      });
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
      triggerObjectUrlDownload(item.downloadUrl, item.filename);
    } finally {
      setSavingDownloadId(null);
      setSavingDownloadProgress(null);
    }
  }, []);

  const handleUseDownloadedInStudio = useCallback(
    async (item: DownloadedVideoItem) => {
      if (item.isAudioOnly) return;
      if (!item.downloadUrl.startsWith('blob:')) {
        setLinkDownloadError(
          'ဤ External Link ၏ Server သည် Browser CORS ခွင့်ပြုမထားသောကြောင့် Studio ထဲသို့ တိုက်ရိုက်သွင်းမရပါ — "Video ဖုန်းထဲ Save မည်" ဖြင့် အရင်ဒေါင်းပြီးမှ Studio ထဲတွင် Video ဖိုင်ရွေးထည့်ပေးပါ။'
        );
        return;
      }

      setLinkDownloadError(null);
      setLoadingToStudioId(item.downloadId);
      try {
        const res = await fetch(item.downloadUrl);
        const videoBlob = await res.blob();
        const safeName = getAsciiSafeMediaFilename(item.filename, '.mp4');
        const localFile = new File([videoBlob], safeName, {
          type: item.mimeType || 'video/mp4',
        });
        handleSelectFile(localFile);
        if (item.durationSec) {
          setVideoDuration(item.durationSec);
        }
        navigateView('editor');
        setOpenToolId('ai_subtitle');
        setTimeout(() => {
          monitorSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      } catch (err) {
        setLinkDownloadError(
          err instanceof Error
            ? err.message
            : 'Studio ထဲသို့ ဗီဒီယိုထည့်ရာတွင် အမှားဖြစ်ပွားပါသည်။'
        );
      } finally {
        setLoadingToStudioId(null);
      }
    },
    [handleSelectFile, navigateView]
  );

  const handleRenderVideo = useCallback(async () => {
    if (!localVideoUrl) {
      setRenderError('ကျေးဇူးပြု၍ ဗီဒီယိုဖိုင် အရင်ရွေးချယ်ထည့်ပေးပါ။');
      return;
    }

    setRenderError(null);
    setRenderProgress(0);
    setOpenToolId('export');
    setIsRendering(true);
    try {
      const data = await exportVideoInBrowser({
        videoUrl: localVideoUrl,
        sourceFilename: videoMeta?.filename || selectedFileRef.current?.name,
        cues,
        colorPresetId,
        brightness,
        contrast,
        saturation,
        fontName,
        fontSize,
        textColorId,
        subtitleX,
        subtitleY,
        subtitleAnimation,
        videoAspectId,
        videoFitMode,
        logoMeta,
        logoConfig,
        textLogoConfig,
        onProgress: setRenderProgress,
      });

      setRenderResult((prev) => {
        if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl);
        return data;
      });
      setActiveMonitorTab('rendered');
    } catch (err) {
      setRenderError(
        err instanceof Error ? err.message : 'Browser ဖြင့် ဗီဒီယိုထုတ်ရာတွင် အမှားဖြစ်ပွားပါသည်။'
      );
    } finally {
      setIsRendering(false);
      setRenderProgress(null);
    }
  }, [
    localVideoUrl,
    videoMeta?.filename,
    cues,
    colorPresetId,
    brightness,
    contrast,
    saturation,
    fontName,
    fontSize,
    textColorId,
    subtitleX,
    subtitleY,
    subtitleAnimation,
    videoAspectId,
    videoFitMode,
    logoMeta,
    logoConfig,
    textLogoConfig,
  ]);

  const handleDownloadMp4 = useCallback(() => {
    if (!renderResult) return;
    setRenderError(null);
    const url = renderResult.blobUrl || renderResult.videoUrl;
    if (url.startsWith('blob:')) {
      triggerObjectUrlDownload(url, renderResult.filename);
    } else {
      triggerDirectDownload(url, renderResult.filename);
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
        'ဖိုင်အရွယ်အစား 150 MB ထက် ကြီးသောကြောင့် "Download Video" ခလုတ်ဖြင့် ဒေါင်းလုဒ်ဆွဲပါ။'
      );
      return;
    }

    setRenderError(null);
    setIsDownloadingMp4(true);
    setDownloadProgress(null);
    try {
      const targetUrl = renderResult.blobUrl || renderResult.videoUrl;
      const res = await fetch(targetUrl);
      const blob = await res.blob();
      const mimeType =
        blob.type ||
        (renderResult.filename.toLowerCase().endsWith('.webm')
          ? 'video/webm'
          : 'video/mp4');
      const fallbackExt = mimeType.includes('webm') ? '.webm' : '.mp4';
      const safeFilename = getAsciiSafeMediaFilename(renderResult.filename, fallbackExt);
      const file = new File([blob], safeFilename, { type: mimeType });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: safeFilename,
        });
      } else {
        triggerBlobDownload(blob, safeFilename);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const fallbackUrl = renderResult.blobUrl || renderResult.videoUrl;
      triggerObjectUrlDownload(fallbackUrl, renderResult.filename);
    } finally {
      setIsDownloadingMp4(false);
      setDownloadProgress(null);
    }
  }, [renderResult]);

  const handleDownloadSrt = useCallback(() => {
    if (!srtText.trim()) return;
    const fallbackBlob = new Blob([srtText.trim() + '\n'], {
      type: 'text/plain;charset=utf-8',
    });
    triggerBlobDownload(fallbackBlob, 'subtitles.srt');
  }, [srtText]);

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

  const jumpToTool = useCallback(
    (toolId: GuideToolTargetId) => {
      if (toolId === 'video_downloader') {
        navigateView('downloader');
        return;
      }
      navigateView('editor');
      setOpenToolId(toolId);
      setTimeout(() => scrollToSection(toolsSectionRef), 60);
    },
    [navigateView]
  );

  const openEditor = useCallback(
    (initialTool: StudioToolId | null = 'ai_subtitle') => {
      navigateView('editor');
      if (initialTool !== undefined) {
        setOpenToolId(initialTool);
      }
    },
    [navigateView]
  );

  const openDownloader = useCallback(() => {
    navigateView('downloader');
  }, [navigateView]);

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
      try {
        const input = document.createElement('input');
        input.value = shareableUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      } catch {
        // Ignore clipboard denial in restricted contexts
      }
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 2200);
    }
  }, [shareableUrl]);

  const inAppBrowserBanner = isInAppBrowser() ? (
    <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <p className="text-xs text-sky-200 leading-relaxed">
        Facebook / Messenger App အတွင်းမှ ဖွင့်ထားပါက File Download အချို့ မဆင်းတတ်ပါ။ ညာဘက်အပေါ် ⋮ မှ{' '}
        <span className="font-semibold text-white">Open in Chrome / Safari</span> ဖြင့် ဖွင့်သုံးပါက အကောင်းဆုံးဖြစ်ပါသည်။
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
        {inAppBrowserBanner && (
          <div className="bg-[#080B12] px-4 sm:px-6 pt-3 max-w-5xl mx-auto">
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
          onBackHome={() => navigateView('hub')}
          onOpenStudio={() => openEditor('ai_subtitle')}
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
              onClick={() => navigateView('hub')}
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
              disabled={(!videoMeta && !localVideoUrl) || isRendering}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {isRendering
                  ? renderProgress !== null
                    ? `ထုတ်ယူနေသည် (${renderProgress}%)...`
                    : 'ထုတ်ယူနေသည်...'
                  : 'ဗီဒီယို ထုတ်ယူမည်'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Studio Workspace */}
      <main id="top" className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-6 py-4 space-y-4">
        {inAppBrowserBanner}

        {/* Two-Column Editing Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Dominant Anchor: Video Monitor */}
          <div ref={monitorSectionRef} className="lg:col-span-7 lg:sticky lg:top-20 min-w-0">
            <VideoMonitor
              localVideoUrl={localVideoUrl}
              videoMeta={videoMeta}
              isUploading={false}
              uploadProgress={null}
              uploadError={null}
              onSelectFile={handleSelectFile}
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
              openToolId={openToolId}
              onToggleTool={handleToggleTool}
              onOpenTool={setOpenToolId}
              geminiApiKey={geminiApiKey}
              onSaveGeminiApiKey={handleSaveGeminiApiKey}
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
              generateProgressText={generateProgressText}
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
              renderProgress={renderProgress}
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
