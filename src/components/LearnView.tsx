"use client";

import { useState, useMemo } from "react";
import type { ArticleMeta } from "@/lib/types";

interface Props {
  entries: ArticleMeta[];
}

type ViewMode = "month" | "week";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function getWeekDates(year: number, month: number, day: number): Date[] {
  const date = new Date(year, month, day);
  const dayOfWeek = date.getDay();
  const start = new Date(date);
  start.setDate(start.getDate() - dayOfWeek);
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function LearnView({ entries }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState(now.getDate());
  const [viewMode, setViewMode] = useState<ViewMode>("month");

  const recentEntries = entries.slice(0, 5);

  // Group entries by date
  const entriesByDate = useMemo(() => {
    const map: Record<string, ArticleMeta[]> = {};
    entries.forEach((e) => {
      const d = e.date.slice(0, 10);
      if (!map[d]) map[d] = [];
      map[d].push(e);
    });
    return map;
  }, [entries]);

  // Available years
  const years = useMemo(() => {
    const set = new Set<number>();
    set.add(now.getFullYear());
    entries.forEach((e) => {
      if (e.date) set.add(parseInt(e.date.slice(0, 4)));
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [entries]);

  // Month calendar data
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  // Week view data
  const weekDates = getWeekDates(year, month, selectedDay);

  // All entries sorted for timeline
  const timelineEntries = useMemo(
    () => [...entries].sort((a, b) => (a.date > b.date ? -1 : 1)),
    [entries]
  );

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold text-gray-800">Learn</h1>

      {/* Recent events */}
      <section>
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
          最近の出来事
        </h2>
        <div className="space-y-2">
          {recentEntries.length > 0 ? (
            recentEntries.map((entry) => (
              <div
                key={entry.slug}
                className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-azuki-400 flex-shrink-0" />
                  <span className="text-sm text-gray-700 truncate">
                    {entry.title}
                  </span>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap ml-3">
                  {entry.date}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">
              まだエントリーがありません
            </p>
          )}
        </div>
      </section>

      {/* Calendar controls */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            {/* Year selector */}
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-azuki-400"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}年
                </option>
              ))}
            </select>

            {/* Month navigation */}
            <button
              onClick={() => {
                if (month === 0) {
                  setMonth(11);
                  setYear(year - 1);
                } else {
                  setMonth(month - 1);
                }
              }}
              className="p-1 text-gray-400 hover:text-azuki-600"
            >
              ‹
            </button>
            <span className="text-sm font-medium text-gray-700 w-8 text-center">
              {month + 1}月
            </span>
            <button
              onClick={() => {
                if (month === 11) {
                  setMonth(0);
                  setYear(year + 1);
                } else {
                  setMonth(month + 1);
                }
              }}
              className="p-1 text-gray-400 hover:text-azuki-600"
            >
              ›
            </button>
          </div>

          {/* View toggle */}
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("month")}
              className={`px-3 py-1 text-xs ${
                viewMode === "month"
                  ? "bg-azuki-500 text-white"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              月
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`px-3 py-1 text-xs ${
                viewMode === "week"
                  ? "bg-azuki-500 text-white"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              週
            </button>
          </div>
        </div>

        {/* Calendar grid */}
        {viewMode === "month" ? (
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            {/* Weekday headers */}
            <div className="calendar-grid bg-gray-50">
              {WEEKDAYS.map((d, i) => (
                <div
                  key={d}
                  className={`text-center text-xs py-2 font-medium ${
                    i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-gray-500"
                  }`}
                >
                  {d}
                </div>
              ))}
            </div>
            {/* Days */}
            <div className="calendar-grid">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="p-2 min-h-[3rem]" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const hasEntries = entriesByDate[dateStr];
                const isToday =
                  day === now.getDate() &&
                  month === now.getMonth() &&
                  year === now.getFullYear();
                const dayOfWeek = (firstDay + i) % 7;

                return (
                  <button
                    key={day}
                    onClick={() => {
                      setSelectedDay(day);
                      setViewMode("week");
                    }}
                    className={`p-1 min-h-[3rem] text-left relative hover:bg-azuki-50 transition-colors ${
                      isToday ? "bg-azuki-50" : ""
                    }`}
                  >
                    <span
                      className={`text-xs ${
                        isToday
                          ? "bg-azuki-500 text-white w-5 h-5 rounded-full flex items-center justify-center"
                          : dayOfWeek === 0
                          ? "text-red-400"
                          : dayOfWeek === 6
                          ? "text-blue-400"
                          : "text-gray-600"
                      }`}
                    >
                      {day}
                    </span>
                    {hasEntries && (
                      <div className="mt-0.5">
                        {hasEntries.slice(0, 2).map((e, idx) => (
                          <div
                            key={idx}
                            className="text-[10px] text-azuki-600 truncate leading-tight"
                          >
                            {e.title}
                          </div>
                        ))}
                        {hasEntries.length > 2 && (
                          <div className="text-[10px] text-gray-400">
                            +{hasEntries.length - 2}
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Week view */
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <div className="calendar-grid bg-gray-50">
              {weekDates.map((d, i) => (
                <div
                  key={i}
                  className={`text-center py-2 ${
                    formatDate(d) === formatDate(now) ? "bg-azuki-50" : ""
                  }`}
                >
                  <div
                    className={`text-xs font-medium ${
                      i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-gray-500"
                    }`}
                  >
                    {WEEKDAYS[i]}
                  </div>
                  <div
                    className={`text-sm mt-0.5 ${
                      formatDate(d) === formatDate(now)
                        ? "text-azuki-600 font-bold"
                        : "text-gray-700"
                    }`}
                  >
                    {d.getDate()}
                  </div>
                </div>
              ))}
            </div>
            <div className="calendar-grid min-h-[8rem]">
              {weekDates.map((d, i) => {
                const dateStr = formatDate(d);
                const dayEntries = entriesByDate[dateStr] || [];
                return (
                  <div key={i} className="p-1 border-r border-gray-50 last:border-r-0">
                    {dayEntries.map((e, idx) => (
                      <div
                        key={idx}
                        className="text-[11px] text-azuki-700 bg-azuki-50 rounded px-1 py-0.5 mb-1 truncate"
                      >
                        {e.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Timeline */}
      <section>
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-6">
          Timeline
        </h2>
        {timelineEntries.length > 0 ? (
          <div className="relative pl-8">
            {/* Vertical line */}
            <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gradient-to-b from-azuki-300 via-azuki-500 to-azuki-800 rounded-full" />

            {timelineEntries.map((entry, i) => (
              <div key={entry.slug} className="relative mb-8 last:mb-0">
                {/* Dot */}
                <div className="absolute -left-5 top-1 w-3 h-3 rounded-full bg-white border-2 border-azuki-400 shadow-sm" />

                <div className="bg-white border border-gray-100 rounded-lg p-4 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-gray-800">
                        {entry.title}
                      </h3>
                      {entry.description && (
                        <p className="text-sm text-gray-500 mt-1">
                          {entry.description}
                        </p>
                      )}
                      {entry.tags && entry.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {entry.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] text-azuki-500 bg-azuki-50 px-1.5 py-0.5 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <time className="text-xs text-gray-400 whitespace-nowrap ml-3">
                      {entry.date}
                    </time>
                  </div>
                </div>
              </div>
            ))}

            {/* End dot */}
            <div className="absolute -left-5 bottom-0 w-3 h-3 rounded-full bg-azuki-700" />
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">
            まだエントリーがありません
          </p>
        )}
      </section>
    </div>
  );
}
