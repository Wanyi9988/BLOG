// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://Wanyi9988.github.io', // 先写这个，后面解释
  base: '/BLOG/',                     // 如果不是用户主页仓库
});
