import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
    title: 'MCP Proxy',
    tagline: 'A self-hosted conductor service for Model Context Protocol servers',
    favicon: 'img/favicon.ico',

    // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
    future: {
        v4: true, // Improve compatibility with the upcoming Docusaurus v4
    },

    // Set the production url of your site here
    url: 'https://philipobenito.github.io',
    // Set the /<baseUrl>/ pathname under which your site is served
    // For GitHub pages deployment, it is often '/<projectName>/'
    baseUrl: process.env.NODE_ENV === 'development' ? '/' : '/mcp-proxy/',

    // GitHub pages deployment config.
    // If you aren't using GitHub pages, you don't need these.
    organizationName: 'philipobenito', // Usually your GitHub org/user name.
    projectName: process.env.NODE_ENV === 'development' ? 'docs' : 'mcp-proxy', // Different for local vs GitHub Pages

    onBrokenLinks: 'throw',
    onBrokenMarkdownLinks: 'warn',

    // Even if you don't use internationalization, you can use this field to set
    // useful metadata like html lang. For example, if your site is Chinese, you
    // may want to replace "en" with "zh-Hans".
    i18n: {
        defaultLocale: 'en',
        locales: ['en'],
    },

    presets: [
        [
            'classic',
            {
                docs: {
                    sidebarPath: './sidebars.ts',
                    // Please change this to your repo.
                    // Remove this to remove the "edit this page" links.
                    editUrl: 'https://github.com/philipobenito/mcp-proxy/tree/main/docs/',
                    routeBasePath: 'docs', // Serve docs at /docs instead of root
                },
                blog: false, // Disable blog functionality
                theme: {
                    customCss: './src/css/custom.css',
                },
            } satisfies Preset.Options,
        ],
    ],

    themeConfig: {
        // Replace with your project's social card
        image: 'img/docusaurus-social-card.jpg',
        navbar: {
            title: 'MCP Proxy',
            items: [
                {
                    type: 'docSidebar',
                    sidebarId: 'docsSidebar',
                    position: 'left',
                    label: 'Documentation',
                },
                {
                    href: 'https://github.com/philipobenito/mcp-proxy',
                    label: 'GitHub',
                    position: 'right',
                },
            ],
        },
        footer: {
            style: 'dark',
            links: [
                {
                    title: 'Docs',
                    items: [
                        {
                            label: 'Getting Started',
                            to: 'docs/getting-started/installation',
                        },
                        {
                            label: 'Guides',
                            to: 'docs/guides/server-discovery',
                        },
                        {
                            label: 'API Reference',
                            to: 'docs/api/http-api',
                        },
                    ],
                },
                {
                    title: 'Community',
                    items: [
                        {
                            label: 'GitHub Issues',
                            href: 'https://github.com/philipobenito/mcp-proxy/issues',
                        },
                        {
                            label: 'GitHub Discussions',
                            href: 'https://github.com/philipobenito/mcp-proxy/discussions',
                        },
                    ],
                },
                {
                    title: 'More',
                    items: [
                        {
                            label: 'GitHub',
                            href: 'https://github.com/philipobenito/mcp-proxy',
                        },
                        {
                            label: 'Model Context Protocol',
                            href: 'https://modelcontextprotocol.io',
                        },
                    ],
                },
            ],
            copyright: `Copyright © ${new Date().getFullYear()} MCP Proxy. Built with Docusaurus.`,
        },
        prism: {
            theme: prismThemes.github,
            darkTheme: prismThemes.dracula,
        },
    } satisfies Preset.ThemeConfig,
};

export default config;
