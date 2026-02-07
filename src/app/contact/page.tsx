export default function ContactPage() {
  return (
    <div className="space-y-12">
      {/* About Me */}
      <section className="text-center">
        <div className="w-20 h-20 rounded-full bg-azuki-100 mx-auto flex items-center justify-center">
          <span className="text-3xl">A</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mt-4">About Me</h1>
        <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto leading-relaxed">
          ここに自己紹介の文章を書きます。
          学びと創作を記録するブログです。
        </p>
      </section>

      {/* SNS Links */}
      <section>
        <h2 className="text-lg font-bold text-gray-800 mb-4 text-center">
          Contact
        </h2>
        <div className="max-w-sm mx-auto space-y-3">
          {/* Bluesky */}
          <a
            href="https://bsky.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-4 border border-gray-100 rounded-lg hover:bg-azuki-50 hover:border-azuki-200 transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <svg
                className="w-5 h-5 text-blue-500"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2C6.5 7 3 10.5 3 13.5c0 3 2 5 4.5 5 1.5 0 3-.5 4.5-2 1.5 1.5 3 2 4.5 2 2.5 0 4.5-2 4.5-5C21 10.5 17.5 7 12 2z" />
              </svg>
              <span className="text-sm font-medium text-gray-700">
                Bluesky
              </span>
            </div>
            <svg
              className="w-4 h-4 text-gray-400 group-hover:text-azuki-500 group-hover:translate-x-0.5 transition-all"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>

          {/* GitHub */}
          <a
            href="https://github.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-4 border border-gray-100 rounded-lg hover:bg-azuki-50 hover:border-azuki-200 transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <svg
                className="w-5 h-5 text-gray-800"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              <span className="text-sm font-medium text-gray-700">GitHub</span>
            </div>
            <svg
              className="w-4 h-4 text-gray-400 group-hover:text-azuki-500 group-hover:translate-x-0.5 transition-all"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        </div>
      </section>

      {/* Additional message area */}
      <section className="text-center">
        <p className="text-xs text-gray-400">
          お気軽にご連絡ください
        </p>
      </section>
    </div>
  );
}
