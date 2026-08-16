import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';
import 'katex/dist/katex.min.css';
import * as Icons from '@element-plus/icons-vue';
import App from './App.vue';
import router from './router';
import { initApi } from './api/index.js';
import './styles.css';

async function bootstrap() {
  const mode = await initApi();
  const app = createApp(App);
  app.use(ElementPlus, { locale: zhCn });
  for (const [name, comp] of Object.entries(Icons)) {
    app.component(name, comp);
  }
  app.use(router);
  app.mount('#app');
  console.log(`[teachAid] 运行模式: ${mode === 'http' ? '服务模式（后端）' : '浏览器模式（IndexedDB）'}`);
}

bootstrap();
