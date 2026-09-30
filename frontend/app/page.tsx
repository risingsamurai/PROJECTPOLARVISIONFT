"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Compass, Shield, Ship, Anchor, Waves, Fish, Navigation } from "lucide-react";
import AccordionGallery from "../components/AccordionGallery/AccordionGallery";
import ParticleText from "../components/ParticleText/ParticleText";

const galleryItems = [
  {
    image: 'https://www.sciencedaily.com/images/1920/antarctic-melting-glacier-calving-climate-change.webp',
    label: 'Antarctic Glacier',
    link: '#'
  },
  { image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTCNu_COXjRH4vIQep9JheE8DmDTwQLBrGQEsp0Jw0x8E9Y7_qJ2LGMGzBF&s=10', label: 'Icebreaker', link: '#' },
  {
    image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQw51DzRI-VtBq0_FGyKxYHCldFAOHECq_m_Dwi9OZg6RGr2MsGNUmcQM_Q&s=10',
    label: 'Antarctic Glacier',
    link: '#'
  },
  {
    image: 'https://cdn.i-scmp.com/sites/default/files/images/methode/2019/01/23/2819e0ac-1e28-11e9-9b66-f8d7b487d426_image_hires_145229.JPG',
    label: 'Harbour',
    link: '#'
  },
  {
    image: 'https://npr.brightspotcdn.com/dims4/default/c2a1502/2147483647/strip/true/crop/1217x912+0+0/resize/880x659!/quality/90/?url=https%3A%2F%2Fmedia.npr.org%2Fassets%2Fimg%2F2018%2F07%2F14%2Fgettyimages-997468440-65fa7d9d27835874a5c3d576f152e51754e0049d.jpg',
    label: 'Skyline',
    link: '#'
  }
];

export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        containerRef.current.style.setProperty("--cursor-x", `${x}px`);
        containerRef.current.style.setProperty("--cursor-y", `${y}px`);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const features = [
    {
      title: "Sea-Ice Forecasting",
      description: "Advanced predictive modeling of sea-ice concentrations to anticipate navigable channels.",
      icon: <Waves className="h-5 w-5 text-white" />,
    },
    {
      title: "Iceberg Trajectory",
      description: "Real-time tracking and prediction of iceberg drift patterns for collision avoidance.",
      icon: <Anchor className="h-5 w-5 text-white" />,
    },
    {
      title: "Safe Route Optimization",
      description: "Algorithmic routing utilizing weather and ice constraints to determine optimal polar paths.",
      icon: <Compass className="h-5 w-5 text-white" />,
    },
    {
      title: "3D Vessel Simulator",
      description: "Immersive 3D environment for training and validating routes in a digital twin.",
      icon: <Ship className="h-5 w-5 text-white" />,
    },
    {
      title: "Wildlife Habitat Monitoring",
      description: "Geospatial tracking of sensitive polar ecosystems and wildlife colonies.",
      icon: <Fish className="h-5 w-5 text-white" />,
    },
    {
      title: "Ocean Freshwater Simulation",
      description: "Fluid dynamics engine visualizing ocean currents and meltwater plume dispersion.",
      icon: <Shield className="h-5 w-5 text-white" />,
    },
  ];

  return (
    <main
      ref={containerRef}
      className="relative min-h-screen w-full overflow-x-hidden bg-[#050505] text-neutral-200 selection:bg-white/20"
    >
      {/* Dynamic Cursor Glow */}
      <div
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300"
        style={{
          background: `radial-gradient(800px circle at var(--cursor-x, 50%) var(--cursor-y, 50%), rgba(255, 255, 255, 0.06), transparent 40%)`,
        }}
      />

      {/* Grid Pattern Overlay */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      {/* Content */}
      <div className="relative z-10 w-full pt-10 px-4 md:px-8">
        <AccordionGallery
          items={galleryItems}
          defaultIndex={2}
          expandRatio={0.52}
          trigger="hover"
          accentColor="#ffffff"
          overlayColor="#060010"
          textColor="#ffffff"
          grayscale
          showLabels
          duration={0.6}
          ease="power3.out"
          parallax={0.5}
          tilt={8}
          stagger={0.06}
          height={460}
          gap={10}
          radius={16}
          orientation="horizontal"
        />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-24 sm:px-12 md:py-32 lg:px-16">
        {/* Header / Badges */}
        <div className="mb-12 flex flex-col items-center justify-center space-y-4 md:flex-row md:space-x-4 md:space-y-0">
          <div className="flex items-center space-x-2 rounded-full border border-neutral-700 bg-neutral-800/50 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-neutral-300 backdrop-blur-md">
            <Shield className="h-3.5 w-3.5" />
            <span>SIH PS 26059</span>
          </div>
          <div className="flex items-center space-x-2 rounded-full border border-neutral-700 bg-neutral-800/50 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-neutral-300 backdrop-blur-md">
            <Navigation className="h-3.5 w-3.5" />
            <span>MoES / NCPOR</span>
          </div>
        </div>

        {/* Hero Section */}
        <div className="text-center">
          <div className="mx-auto" style={{ width: '100%', height: 220 }}>
            <ParticleText
              text="POLARIS"
              particleSize={2.2}
              density={4}
              color="#f5f5f5"
              highlightColor="#cfcfcf"
              scatter={190}
              gatherDuration={1600}
              stagger={420}
              pointerRepel={42}
              repelRadius={120}
              idleDrift={0.8}
              trigger="mount"
              fontSize="clamp(3.5rem, 13vw, 9rem)"
              fontWeight={800}
              fontFamily="inherit"
              glow
            />
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-400 md:text-xl leading-relaxed">
            Polar Navigation & Environmental Intelligence Dashboard. 
            A comprehensive unified platform for navigating the world's most extreme oceanic conditions safely and sustainably.
          </p>
          
          <div className="mt-10 flex justify-center">
            <Link
              href="/dashboard"
              className="group relative flex items-center gap-3 overflow-hidden rounded-full bg-white px-8 py-3.5 text-sm font-bold text-black shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] transition-all hover:scale-105 hover:bg-neutral-200 hover:shadow-[0_0_60px_-10px_rgba(255,255,255,0.5)]"
            >
              <span className="relative z-10">Launch Dashboard</span>
              <ArrowRight className="relative z-10 h-4 w-4 transition-transform group-hover:tranneutral-x-1" />
              <div className="absolute inset-0 z-0 bg-gradient-to-r from-white to-neutral-300 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </Link>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="mx-auto mt-20 grid max-w-4xl grid-cols-2 gap-8 border-y border-neutral-800/60 py-10 md:grid-cols-4 text-center">
          <div className="flex flex-col items-center justify-center space-y-2">
            <span className="text-4xl font-extrabold text-white">7</span>
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">Core system modules</span>
          </div>
          <div className="flex flex-col items-center justify-center space-y-2">
            <span className="text-4xl font-extrabold text-white">3</span>
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">AI/ML models (IceNet, LSTM, A*)</span>
          </div>
          <div className="flex flex-col items-center justify-center space-y-2">
            <span className="text-4xl font-extrabold text-white">PS 26059</span>
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">SIH problem statement</span>
          </div>
          <div className="flex flex-col items-center justify-center space-y-2">
            <span className="text-4xl font-extrabold text-white">25km</span>
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">ERA5 / NSIDC Grid Res</span>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="mt-28 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, idx) => (
            <div
              key={idx}
              className="group relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40 p-8 transition-all hover:border-neutral-600 hover:bg-neutral-800/60"
            >
              <div className="mb-4 inline-flex rounded-lg bg-neutral-800 p-3 shadow-inner ring-1 ring-white/10 transition-colors group-hover:bg-neutral-700">
                {feature.icon}
              </div>
              <h3 className="mb-2 text-lg font-medium text-neutral-200">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-neutral-400">{feature.description}</p>
              
              {/* Subtle hover gradient within card */}
              <div className="absolute -right-20 -top-20 z-0 h-40 w-40 rounded-full bg-white/5 blur-3xl transition-opacity group-hover:opacity-100 opacity-0" />
            </div>
          ))}
        </div>

      </div>

      {/* Intelligence Layer - Full Bleed */}
      <div className="relative z-10 mt-32 w-full">
        <h2 className="mb-12 text-center text-3xl font-bold tracking-tight text-neutral-200 sm:text-4xl">Intelligence Layer</h2>
        <div className="flex w-full flex-col">
          
          {/* Row 1 */}
          <div className="group relative w-full overflow-hidden bg-[#050505] py-16 transition-colors duration-300 ease-out hover:bg-white">
            <div className="pointer-events-none absolute -right-10 -top-10 z-0 select-none text-[8rem] font-black tracking-tighter text-neutral-800/40 transition-colors duration-300 group-hover:text-neutral-200">7-DAY</div>
            <div className="relative z-10 mx-auto max-w-5xl px-6 sm:px-12 lg:px-16">
              <h3 className="text-xl font-semibold text-neutral-300 transition-colors duration-300 group-hover:text-black">Sea-Ice Forecasting</h3>
              <p className="mt-2 max-w-3xl text-sm text-neutral-500 transition-colors duration-300 group-hover:text-neutral-600">IceNet (U-Net ensemble) predicts 7-day sea-ice concentration from satellite data.</p>
            </div>
          </div>

          {/* Row 2 */}
          <div className="group relative w-full overflow-hidden bg-[#050505] py-16 transition-colors duration-300 ease-out hover:bg-white">
            <div className="pointer-events-none absolute -right-10 -top-10 z-0 select-none text-[8rem] font-black tracking-tighter text-neutral-800/40 transition-colors duration-300 group-hover:text-neutral-200">72H</div>
            <div className="relative z-10 mx-auto max-w-5xl px-6 sm:px-12 lg:px-16">
              <h3 className="text-xl font-semibold text-neutral-300 transition-colors duration-300 group-hover:text-black">Iceberg Trajectory Prediction</h3>
              <p className="mt-2 max-w-3xl text-sm text-neutral-500 transition-colors duration-300 group-hover:text-neutral-600">LSTM model forecasts iceberg drift at 24h/48h/72h horizons with uncertainty cones.</p>
            </div>
          </div>

          {/* Row 3 */}
          <div className="group relative w-full overflow-hidden bg-[#050505] py-16 transition-colors duration-300 ease-out hover:bg-white">
            <div className="pointer-events-none absolute -right-10 -top-10 z-0 select-none text-[8rem] font-black tracking-tighter text-neutral-800/40 transition-colors duration-300 group-hover:text-neutral-200">A*</div>
            <div className="relative z-10 mx-auto max-w-5xl px-6 sm:px-12 lg:px-16">
              <h3 className="text-xl font-semibold text-neutral-300 transition-colors duration-300 group-hover:text-black">Safe Route Optimization</h3>
              <p className="mt-2 max-w-3xl text-sm text-neutral-500 transition-colors duration-300 group-hover:text-neutral-600">A* search over a weighted ice/current grid generates safest/balanced/fastest routes.</p>
            </div>
          </div>

        </div>
      </div>

      {/* Start Bottom Content Container */}
      <div className="relative z-10 mx-auto max-w-6xl px-6 pb-24 sm:px-12 md:pb-32 lg:px-16">
        
        {/* Architecture Grid */}
        <div className="mt-32 mb-16">
          <h2 className="mb-12 text-center text-3xl font-bold tracking-tight text-neutral-200 sm:text-4xl">Architecture</h2>
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
            
            {[
              { num: "01", title: "Data Ingestion Layer", sub: "NSIDC · BYU · ERA5", tags: ["APScheduler", "xarray", "Realtime"] },
              { num: "02", title: "Forecasting Layer", sub: "IceNet · LSTM", tags: ["PyTorch", "70B-scale grid", "Python"] },
              { num: "03", title: "Storage Layer", sub: "PostGIS + Redis", tags: ["PostGIS", "Redis", "Geospatial"] },
              { num: "04", title: "Orchestration Layer", sub: "FastAPI", tags: ["REST", "Python", "Backend"] },
              { num: "05", title: "Delivery Layer", sub: "WebSocket", tags: ["WebSocket", "Live", "Telemetry"] },
              { num: "06", title: "Output Layer", sub: "Routes + Alerts", tags: ["A*", "Alerts", "Reports"] }
            ].map((card, idx) => (
              <div key={idx} className="group flex flex-col justify-between rounded-2xl border border-neutral-800/60 bg-[#0a0a0a] p-6 transition-all duration-300 hover:-tranneutral-y-1 hover:bg-white hover:border-white">
                <div>
                  <div className="mb-4 text-xs font-bold text-neutral-600 transition-colors duration-300 group-hover:text-neutral-400">{card.num}</div>
                  <h3 className="text-lg font-medium text-neutral-200 transition-colors duration-300 group-hover:text-black">{card.title}</h3>
                  <p className="mt-1 text-sm text-neutral-400 transition-colors duration-300 group-hover:text-neutral-600">{card.sub}</p>
                </div>
                <div className="mt-8 flex flex-wrap gap-2">
                  {card.tags.map(tag => (
                    <span key={tag} className="rounded-full bg-neutral-800/50 px-2.5 py-1 text-[10px] font-medium tracking-wide text-neutral-400 ring-1 ring-inset ring-neutral-700/50 transition-colors group-hover:bg-neutral-100 group-hover:text-neutral-800 group-hover:ring-neutral-300">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            
          </div>
        </div>

      </div>

      {/* Footer */}
      <footer className="relative z-10 mt-auto border-t border-neutral-800/60 bg-[#050505]/80 py-8 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-center px-6 lg:px-16">
          <p className="text-xs tracking-wider text-neutral-600">
            INTELLIGENT POLAR NAVIGATION
          </p>
        </div>
      </footer>
    </main>
  );
}
