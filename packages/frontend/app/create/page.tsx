"use client";

import { SkillPanel } from "../../components/workspace/skill-panel";
import { WorkflowCanvas } from "../../components/workspace/workflow-canvas";
import { WorkspaceSidebar } from "../../components/workspace/workspace-sidebar";

/**
 * /create — Workflow Workspace
 * Fynt-style layout: vertical icon sidebar + skill discovery panel + canvas.
 * No traditional header — the sidebar IS the navigation.
 */
export default function CreatePage() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Vertical icon sidebar */}
      <WorkspaceSidebar />

      {/* Skill discovery panel */}
      <SkillPanel />

      {/* Canvas area */}
      <div className="relative flex-1">
        {/* Top bar within canvas */}
        <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between border-b-2 border-pure-black bg-off-white/90 px-4 py-2 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-bold uppercase text-on-surface-variant">
              Canvas
            </span>
            <span className="border-2 border-electric-purple bg-electric-purple/10 px-2 py-0.5 font-mono text-[10px] font-bold text-electric-purple">
              Workflow 1
            </span>
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center border border-pure-black/30 font-mono text-xs text-on-surface-variant hover:bg-surface-container"
            >
              +
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-on-surface-variant">
              Drag skills from panel → connect nodes
            </span>
          </div>
        </div>

        {/* React Flow canvas */}
        <WorkflowCanvas />
      </div>
    </div>
  );
}
