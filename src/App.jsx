import React, { useEffect, useRef, useState } from "react";
import axios from "axios";

import VideoMob from "./acces/video_mob.mp4";
import VideoNote from "./acces/video_note.mp4";

/**
 * baseURL: "" — чтобы работал Vite proxy (/api -> Django)
 */
const api = axios.create({
  baseURL: "",
  timeout: 20000,
});

const App = () => {
  const [settings, setSettings] = useState({
    brand_name: "",
    subtitle: "",
    whatsapp_link: "",
    footer_text: "",
    logo_url: "",
  });

  const [offers, setOffers] = useState([]);
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(true);

  // ✅ старт: autoplay всегда БЕЗ ЗВУКА
  // звук включаем только по клику (и иконка исчезает)
  const [soundEnabled, setSoundEnabled] = useState(false);

  const normalizeUrl = (u) => {
    const s = String(u || "").trim();
    if (!s) return "";
    if (s.startsWith("/")) return s;
    return s;
  };

  const toPriceText = (v) => String(v ?? "").trim();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setApiError("");

      try {
        const [sRes, oRes] = await Promise.all([
          api.get("/api/settings/"),
          api.get("/api/offers/"),
        ]);

        if (cancelled) return;

        const s = sRes?.data || {};
        const list = Array.isArray(oRes?.data) ? oRes.data : [];

        setSettings({
          brand_name: String(s.brand_name || ""),
          subtitle: String(s.subtitle || ""),
          whatsapp_link: String(s.whatsapp_link || ""),
          footer_text: String(s.footer_text || ""),
          logo_url: normalizeUrl(s.logo_url || ""),
        });

        const mapped = list
          .map((x) => {
            const vidsRaw = Array.isArray(x.videos) ? x.videos : [];
            const vids = vidsRaw
              .map((v) => ({
                id: String(v.id ?? ""),
                src: normalizeUrl(v.src || v.video_url || ""),
                duration: String(v.duration || ""),
                poster: normalizeUrl(v.poster || v.poster_url || ""),
              }))
              .filter((v) => Boolean(v.src));

            return {
              key: String(x.key || ""),
              title: String(x.title || ""),
              sub: String(x.sub || ""),
              badge: String(x.badge || ""),
              price: toPriceText(x.price || ""),
              old_price: toPriceText(x.old_price || ""),
              waText: String(x.wa_text || x.waText || ""),
              sort_order: Number.isFinite(Number(x.sort_order))
                ? Number(x.sort_order)
                : 0,
              list: Array.isArray(x.list)
                ? x.list.map((t) => String(t || "")).filter(Boolean)
                : [],
              videos: vids,
            };
          })
          .filter((x) => x.key && x.title);

        mapped.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        setOffers(mapped);

        if (!mapped.length) {
          setApiError("Бекден тарифтер келбеди (пустой список).");
        }
      } catch (e) {
        console.error(e);
        const msg = e?.response?.status
          ? `API error ${e.response.status}: ${String(
              e.response?.statusText || ""
            )}`
          : `API unreachable: ${String(e?.message || "unknown")}`;
        if (!cancelled) setApiError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const WHATSAPP_LINK = settings.whatsapp_link || "https://wa.me/996221000953";

  const scrollToId = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openWhatsApp = (text) => {
    const msg = encodeURIComponent(text || "Саламатсызбы! Заказ бергим келет.");
    window.open(`${WHATSAPP_LINK}?text=${msg}`, "_blank", "noopener,noreferrer");
  };

  // ===== Header появляется после скролла ниже баннера =====
  const heroRef = useRef(null);
  const [showHeader, setShowHeader] = useState(false);

  useEffect(() => {
    let raf = 0;

    const calc = () => {
      raf = 0;
      const hero = heroRef.current;
      const heroH = hero ? hero.getBoundingClientRect().height : 0;
      const y = window.scrollY || 0;

      const threshold = Math.max(220, heroH * 0.85);
      setShowHeader(y >= threshold);
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(calc);
    };

    calc();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", calc);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", calc);
    };
  }, []);

  // ===== Hero video control (autoplay muted + click to enable sound) =====
  const heroVideoMobRef = useRef(null);
  const heroVideoNoteRef = useRef(null);

  const isDesktopNow = () => {
    if (typeof window === "undefined") return false;
    if (!window.matchMedia) return false;
    return window.matchMedia("(min-width: 768px)").matches;
  };

  const getActiveHeroVideo = () =>
    isDesktopNow() ? heroVideoNoteRef.current : heroVideoMobRef.current;

  const getInactiveHeroVideo = () =>
    isDesktopNow() ? heroVideoMobRef.current : heroVideoNoteRef.current;

  const safePause = (v) => {
    if (!v) return;
    try {
      v.pause();
    } catch {}
  };

  const safePlay = async (v) => {
    if (!v) return;
    try {
      const p = v.play?.();
      if (p && typeof p.then === "function") await p;
    } catch (e) {
      // autoplay может блокнуться — но у нас muted autoplay обычно проходит
      console.error(e);
    }
  };

  const syncHero = async () => {
    const active = getActiveHeroVideo();
    const inactive = getInactiveHeroVideo();

    // ✅ чтобы не играли оба
    safePause(inactive);

    if (showHeader) {
      // если ушли вниз — стопаем оба (как было у тебя)
      [heroVideoMobRef.current, heroVideoNoteRef.current].forEach((v) => {
        if (!v) return;
        try {
          v.muted = true;
          v.pause();
          v.currentTime = 0;
        } catch {}
      });
      return;
    }

    // ✅ autoplay всегда muted, звук только по клику
    if (active) {
      try {
        active.muted = !soundEnabled ? true : false;
        active.volume = 1;
      } catch {}
      await safePlay(active);
    }
  };

  // ✅ автозапуск на старте + при ресайзе/смене режима
  useEffect(() => {
    let raf = 0;

    raf = requestAnimationFrame(() => {
      syncHero();
    });

    const onResize = () => {
      syncHero();
    };

    window.addEventListener("resize", onResize);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHeader, soundEnabled]);

  // ✅ клик по баннеру -> включить звук и продолжить проигрывание
  const enableHeroSound = async () => {
    if (soundEnabled) return;
    setSoundEnabled(true);

    const active = getActiveHeroVideo();
    const inactive = getInactiveHeroVideo();

    // второй гарантированно выключаем
    safePause(inactive);
    if (inactive) {
      try {
        inactive.muted = true;
      } catch {}
    }

    if (!active) return;

    try {
      active.muted = false;
      active.volume = 1;
    } catch {}

    await safePlay(active);
  };

  // ===== Modal =====
  const [modalOpen, setModalOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState(null);
  const modalVideoRef = useRef(null);
  const [isVideoLoading, setIsVideoLoading] = useState(false);

  const openVideo = (v) => {
    if (!v?.src) return;
    setActiveVideo(v);
    setModalOpen(true);
    setIsVideoLoading(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setActiveVideo(null);
    setIsVideoLoading(false);
  };

  useEffect(() => {
    if (!modalOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev || "";
    };
  }, [modalOpen]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && closeModal();
    if (modalOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return undefined;
    const v = modalVideoRef.current;
    if (!v) return undefined;
    try {
      v.currentTime = 0;
    } catch {}
    return undefined;
  }, [modalOpen, activeVideo]);

  // ===== Carousel =====
  const carouselRef = useRef(null);
  const positionsRef = useRef([]);
  const animRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const collectPositions = () => {
    const el = carouselRef.current;
    if (!el) return;
    const cards = Array.from(el.querySelectorAll("[data-card='offer']"));
    positionsRef.current = cards.map((c) => c.offsetLeft);
  };

  const stopAnimation = () => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = 0;
    }
    isAnimatingRef.current = false;
  };

  const getNearestIndex = () => {
    const el = carouselRef.current;
    const pos = positionsRef.current;
    if (!el || !pos.length) return 0;

    const left = el.scrollLeft;

    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < pos.length; i += 1) {
      const d = Math.abs(pos[i] - left);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  };

  const easeInOut = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const animateScrollTo = (targetLeft, durationMs = 520) => {
    const el = carouselRef.current;
    if (!el) return;

    stopAnimation();

    const startLeft = el.scrollLeft;
    const delta = targetLeft - startLeft;
    if (Math.abs(delta) < 0.5) return;

    isAnimatingRef.current = true;
    const startTime = performance.now();

    const tick = (now) => {
      if (!isAnimatingRef.current) return;

      const t = Math.min(1, (now - startTime) / durationMs);
      const k = easeInOut(t);
      el.scrollLeft = startLeft + delta * k;

      if (t < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        animRef.current = 0;
        isAnimatingRef.current = false;
        el.scrollLeft = targetLeft;
        collectPositions();
        setActiveIndex(getNearestIndex());
      }
    };

    animRef.current = requestAnimationFrame(tick);
  };

  const scrollToIndex = (idx) => {
    collectPositions();
    const pos = positionsRef.current;
    if (!pos.length) return;

    const next = Math.max(0, Math.min(pos.length - 1, idx));
    setActiveIndex(next);

    const targetLeft = next === 0 ? 0 : pos[next] || 0;
    animateScrollTo(targetLeft, 520);
  };

  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;

    const init = () => {
      collectPositions();
      setActiveIndex(getNearestIndex());
    };

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(init);
    });

    const el = carouselRef.current;
    if (!el) return undefined;

    let raf = 0;
    const onScroll = () => {
      if (isAnimatingRef.current) return;
      if (raf) return;

      raf = requestAnimationFrame(() => {
        raf = 0;
        collectPositions();
        setActiveIndex(getNearestIndex());
      });
    };

    const onResize = () => {
      collectPositions();
      setActiveIndex(getNearestIndex());
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      if (raf) cancelAnimationFrame(raf);
      stopAnimation();
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [offers.length]);

  const VideoThumb = ({ v, rounded = "rounded-none" }) => {
    const [ready, setReady] = useState(false);
    const src = v?.src || "";
    const poster = v?.poster || "";

    return (
      <button
        type="button"
        onClick={() => openVideo(v)}
        className={`group relative h-full w-full overflow-hidden bg-slate-950 text-left ${rounded}`}
        aria-label="Видео көрүү"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-black" />

        {!!poster && (
          <img
            src={poster}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-95"
            loading="lazy"
          />
        )}

        {!poster && !!src && (
          <video
            src={src}
            muted
            playsInline
            preload="metadata"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
              ready ? "opacity-90" : "opacity-0"
            }`}
            onLoadedData={() => setReady(true)}
            onError={() => setReady(false)}
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

        <div className="absolute left-4 bottom-4 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-white/95 shadow transition group-hover:scale-110">
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-blue-600">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <div className="rounded-full border border-white/20 bg-black/45 px-3 py-1 text-xs font-semibold text-white">
            {v?.duration || ""}
          </div>
        </div>
      </button>
    );
  };

  const brand = settings.brand_name || "kuttuktoo";
  const logoUrl = settings.logo_url;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <style>{`
        .offerCarousel{ scrollbar-width:none; -ms-overflow-style:none; }
        .offerCarousel::-webkit-scrollbar{ display:none; height:0; width:0; }
        .heroVideo{
          filter: saturate(1.12) contrast(1.06) brightness(1.04);
          transform: scale(1.02);
          pointer-events: none; /* ✅ клики идут через видео */
        }
      `}</style>

      {/* ===== Header ===== */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur transition-all duration-300 ${
          showHeader
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "-translate-y-2 opacity-0 pointer-events-none"
        }`}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => scrollToId("top")}
            className="flex items-center gap-3 rounded-xl p-1 text-left hover:bg-slate-100"
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo"
                className="h-10 w-10 rounded-xl object-cover"
              />
            ) : (
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-sm font-extrabold text-white">
                {String(brand || "K").slice(0, 1).toUpperCase()}
              </div>
            )}

            <div className="leading-tight">
              <div className="text-sm font-extrabold">{brand}</div>
              <div className="text-xs text-slate-500">
                {settings.subtitle || "видео + тарифтер"}
              </div>
            </div>
          </button>

          <nav className="hidden items-center gap-2 md:flex">
            <button
              className="rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              onClick={() => scrollToId("offers")}
            >
              Тарифтер
            </button>
            <button
              className="rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              onClick={() => scrollToId("contacts")}
            >
              Байланыш
            </button>
          </nav>

          <button
            type="button"
            onClick={() =>
              openWhatsApp("Саламатсызбы! Заказды талкуулагым келет.")
            }
            className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            WhatsApp жазуу
          </button>
        </div>
      </header>

      {apiError && (
        <div className="mx-auto w-full max-w-6xl px-4 pt-4">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <div className="font-bold">Бекке туташуу жок</div>
            <div className="mt-1">{apiError}</div>
          </div>
        </div>
      )}

      {/* ===== HERO: autoplay muted + click anywhere for sound ===== */}
      <section
        id="top"
        ref={heroRef}
        className="relative overflow-hidden bg-black"
        style={{ height: "100svh" }}
      >
        <div className="absolute inset-0 z-0 bg-black">
          <video
            ref={heroVideoMobRef}
            className="heroVideo block h-full w-full object-cover md:hidden"
            src={VideoMob}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onError={(e) => console.error("Hero mobile video error", e)}
          />
          <video
            ref={heroVideoNoteRef}
            className="heroVideo hidden h-full w-full object-cover md:block"
            src={VideoNote}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onError={(e) => console.error("Hero desktop video error", e)}
          />

          <div className="absolute inset-0 bg-black/18" style={{ pointerEvents: "none" }} />
          <div
            className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/10 to-black/35"
            style={{ pointerEvents: "none" }}
          />
        </div>

        {/* ✅ КЛИК НА ВЕСЬ БАННЕР (всегда, но если звук уже включен — ничего не делает) */}
        <button
          type="button"
          onClick={enableHeroSound}
          className="absolute inset-0 z-20"
          aria-label="Включить звук"
          style={{ background: "transparent" }}
        />

        {/* ✅ Иконка по центру пока звук выключен */}
        {!soundEnabled && (
          <>
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25 bg-black/45 p-5 text-white backdrop-blur">
              <svg
                viewBox="0 0 24 24"
                className="h-9 w-9 fill-white"
                aria-hidden="true"
              >
                <path d="M11 5.5 6.5 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3.5L11 18.5a1 1 0 0 0 1.6-.8V6.3a1 1 0 0 0-1.6-.8z" />
                <path d="M15.5 8.2a1 1 0 0 1 1.4 0 6 6 0 0 1 0 7.6 1 1 0 1 1-1.4-1.4 4 4 0 0 0 0-4.8 1 1 0 0 1 0-1.4z" />
                <path d="M18.3 6a1 1 0 0 1 1.4 0 9 9 0 0 1 0 12 1 1 0 1 1-1.4-1.4 7 7 0 0 0 0-9.2 1 1 0 0 1 0-1.4z" />
              </svg>
            </div>

            <div className="pointer-events-none absolute left-1/2 top-[calc(50%+74px)] z-30 -translate-x-1/2 rounded-full border border-white/15 bg-black/35 px-4 py-1.5 text-xs font-semibold text-white/90 backdrop-blur">
              Нажми в любом месте, чтобы включить звук
            </div>
          </>
        )}

        <div className="relative z-10 mx-auto h-full w-full max-w-6xl px-4">
          <div className="absolute right-0 top-6 z-40">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
              Куттуктоо видеолору
            </div>
          </div>

          {/* ✅ кнопки выше клика */}
          <div className="absolute bottom-10 left-1/2 z-40 w-full -translate-x-1/2">
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => scrollToId("offers")}
                className="w-full max-w-[320px] rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto"
              >
                Тарифтерди көрүү
              </button>
              <button
                type="button"
                onClick={() =>
                  openWhatsApp("Саламатсызбы! Видео куттуктоо керек эле.")
                }
                className="w-full max-w-[320px] rounded-2xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur hover:bg-white/15 sm:w-auto"
              >
                WhatsAppка жазуу
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===== INTRO ===== */}
      <section
        id="intro"
        className="mx-auto flex min-h-[100svh] w-full max-w-6xl flex-col items-center justify-center px-4 py-14 text-center"
      >
        <h1 className="mx-auto max-w-4xl text-4xl font-black tracking-tight md:text-6xl">
          🎉 Сиздин майрамыңыз – биздин чыгармачылык!
        </h1>

        <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 md:text-lg">
          Жакындарыңыз үчүн унутулгус видео куттуктоо жиберип 🤩🎁 Унутулгус эмоция ✨
          тартуулаңыз 💐
        </p>
      </section>

      {/* ===== OFFERS ===== */}
      <section
        id="offers"
        className="mx-auto min-h-[100svh] w-full max-w-6xl px-4 py-12"
      >
        <div className="text-center">
          <h2 className="text-3xl font-extrabold md:text-4xl">Тарифти тандаңыз</h2>
          <p className="mt-2 text-slate-600">
            Мисалды көрүңүз — тарифти тандаңыз — ишке киришебиз.
          </p>
        </div>

        <div className="mt-8 flex items-center justify-end">
          <div className="select-none rounded-2xl border border-slate-200 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-600">
            ⇆ Листай
          </div>
        </div>

        {loading ? (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 text-center text-slate-600">
            Жүктөлүүдө…
          </div>
        ) : offers.length ? (
          <div
            ref={carouselRef}
            className="offerCarousel mt-4 flex gap-4 overflow-x-auto pb-2"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {offers.map((o) => {
              const isInvite = o.key === "invite";
              const v1 = o.videos?.[0] || null;
              const v2 = o.videos?.[1] || null;

              return (
                <div key={o.key} data-card="offer" style={{ flex: "0 0 auto" }}>
                  <div
                    className={`relative flex h-full w-[320px] flex-col overflow-hidden rounded-3xl border bg-white shadow-sm sm:w-[340px] md:w-[360px] ${
                      o.badge
                        ? "border-blue-500 ring-1 ring-blue-500/20"
                        : "border-slate-200"
                    }`}
                  >
                    {!!o.badge && (
                      <div className="absolute left-4 top-4 z-10 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                        {o.badge}
                      </div>
                    )}

                    {!isInvite && (
                      <div className="h-[190px] w-full md:h-[210px]">
                        <VideoThumb v={v1} rounded="rounded-none" />
                      </div>
                    )}

                    {isInvite && (
                      <div className="h-[190px] w-full bg-slate-950 p-3 md:h-[210px]">
                        <div className="grid h-full grid-cols-2 gap-3">
                          <div className="h-full overflow-hidden rounded-2xl">
                            <VideoThumb v={v1} rounded="rounded-2xl" />
                          </div>
                          <div className="h-full overflow-hidden rounded-2xl">
                            <VideoThumb v={v2 || v1} rounded="rounded-2xl" />
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-1 flex-col p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xl font-extrabold">{o.title}</div>
                          <div className="mt-1 text-sm text-slate-500">{o.sub}</div>
                        </div>

                        <div className="text-right">
                          {!!String(o.old_price || "").trim() && (
                            <div className="text-xs font-semibold text-slate-400 line-through">
                              {o.old_price}
                            </div>
                          )}
                          <div className="text-2xl font-black">{o.price}</div>
                        </div>
                      </div>

                      <ul className="mt-5 flex flex-1 flex-col gap-3 text-sm">
                        {(o.list || []).map((t, i) => (
                          <li key={`${o.key}-${i}`} className="flex items-start gap-3">
                            <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                              ✓
                            </span>
                            <span className="text-slate-700">{t}</span>
                          </li>
                        ))}
                      </ul>

                      {!isInvite ? (
                        <div className="mt-6 grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => openVideo(v1)}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                          >
                            Мисал көрүү
                          </button>
                          <button
                            type="button"
                            onClick={() => openWhatsApp(o.waText)}
                            className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
                              o.badge
                                ? "bg-blue-600 text-white hover:bg-blue-700"
                                : "bg-slate-900 text-white hover:bg-slate-800"
                            }`}
                          >
                            Заказ берүү
                          </button>
                        </div>
                      ) : (
                        <div className="mt-6 grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => openVideo(v1)}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                          >
                            Видео 1
                          </button>
                          <button
                            type="button"
                            onClick={() => openVideo(v2 || v1)}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                          >
                            Видео 2
                          </button>
                          <button
                            type="button"
                            onClick={() => openWhatsApp(o.waText)}
                            className="col-span-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                          >
                            Заказ берүү
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 text-center text-slate-600">
            Тарифтер жок.
          </div>
        )}
      </section>

      <section id="contacts" className="bg-slate-900 py-14">
        <div className="mx-auto flex min-h-[100svh] w-full max-w-6xl flex-col items-center justify-center gap-6 px-4 text-center md:flex-row md:justify-between md:text-left">
          <div>
            <h2 className="text-3xl font-extrabold text-white">Заказ берүү</h2>
            <p className="mt-2 max-w-xl text-slate-300">
              Майрамды айтыңыз + кимге экенин жазыңыз — эң ылайыктуу тарифти сунуштайм.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              openWhatsApp(
                "Саламатсызбы! Видео куттуктоо керек. Майрам: ... Кимге: ..."
              )
            }
            className="rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            WhatsAppка жазуу
          </button>
        </div>
      </section>

      <footer className="bg-slate-950 py-3">
        <div className="mx-auto w-full max-w-6xl px-4 text-center text-xs text-slate-400">
          {settings.footer_text || `© ${new Date().getFullYear()} REKLAM`}
        </div>
      </footer>

      {modalOpen && activeVideo && (
        <div
          className="fixed inset-0 z-[999] grid place-items-center bg-slate-950/70 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={closeModal}
        >
          <div
            className="w-full max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="text-sm font-extrabold">Мисал видео</div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
              >
                Жабуу
              </button>
            </div>

            <div className="relative bg-slate-900">
              <video
                ref={modalVideoRef}
                key={activeVideo.src}
                src={activeVideo.src}
                controls
                autoPlay
                playsInline
                preload="auto"
                className="aspect-video w-full"
                onWaiting={() => setIsVideoLoading(true)}
                onCanPlay={() => setIsVideoLoading(false)}
                onPlaying={() => setIsVideoLoading(false)}
              />

              {isVideoLoading && (
                <div className="absolute inset-0 grid place-items-center bg-black/35">
                  <div className="flex items-center gap-3 rounded-2xl bg-white/90 px-4 py-2 text-sm font-semibold text-slate-900">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
                    Жүктөлүүдө…
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
