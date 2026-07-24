"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    document.body.style.overflow = navigationOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [navigationOpen]);

  return (
    <div className="flex min-h-screen gap-0 xl:gap-3">
      <Sidebar open={navigationOpen} onClose={() => setNavigationOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setNavigationOpen(true)} />
        <motion.main
          key={pathname}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
          className="flex-1 px-4 py-5 sm:px-6 sm:py-7 xl:px-8"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
