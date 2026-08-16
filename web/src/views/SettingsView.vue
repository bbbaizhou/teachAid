<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import {
  getSettings, saveSettings, createBackup, getBackups, deleteBackup, backupDownloadUrl
} from '../api/index.js';
import http from '../api/index.js';

const settings = ref({ ai: {}, majors: [], sectionTimes: [], app: {} });
const aiForm = ref({ provider: 'deepseek', apiKey: '', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com', temperature: 0.8 });
const majors = ref([]);
const newMajor = ref('');
const sectionTimesText = ref('');
const DEFAULT_SECTION_TIMES = JSON.stringify([
  ['1', '08:00-08:45'], ['2', '08:55-09:40'], ['3', '10:00-10:45'], ['4', '10:55-11:40'],
  ['5', '14:00-14:45'], ['6', '14:55-15:40'], ['7', '16:00-16:45'], ['8', '16:55-17:40'],
  ['9', '19:00-19:45'], ['10', '19:55-20:40'], ['11', '20:50-21:35'], ['12', '21:45-22:30']
], null, 2);
const testing = ref(false);
const backingUp = ref(false);
const backups = ref([]);

async function load() {
  const s = await getSettings();
  settings.value = s;
  aiForm.value = {
    provider: s.ai.provider || 'deepseek',
    apiKey: '',
    model: s.ai.model || 'deepseek-chat',
    baseUrl: s.ai.baseUrl || 'https://api.deepseek.com',
    temperature: s.ai.temperature ?? 0.8
  };
  majors.value = [...(s.majors || [])];
  sectionTimesText.value = JSON.stringify(s.sectionTimes || [], null, 2);
  backups.value = await getBackups();
}

async function saveAi() {
  const payload = { ai: { ...aiForm.value } };
  if (!aiForm.value.apiKey.trim()) delete payload.ai.apiKey;
  await saveSettings(payload);
  ElMessage.success('AI 设置已保存');
}

async function testAi() {
  testing.value = true;
  try {
    if (!aiForm.value.apiKey.trim()) {
      // 没有输入新 key 时先用已保存的配置测试
    }
    const res = await http.post('/ai/test', {});
    ElMessage.success(`连接成功：${res || '正常'}`);
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    testing.value = false;
  }
}

async function saveMajors() {
  await saveSettings({ majors: majors.value.filter(Boolean) });
  ElMessage.success('专业配置已保存');
}

function addMajor() {
  const m = newMajor.value.trim();
  if (!m) return;
  if (!majors.value.includes(m)) majors.value.push(m);
  newMajor.value = '';
}

async function saveSectionTimes() {
  try {
    const parsed = JSON.parse(sectionTimesText.value);
    if (!Array.isArray(parsed)) throw new Error('格式必须是二维数组');
    await saveSettings({ sectionTimes: parsed });
    ElMessage.success('节次时间表已保存');
  } catch (e) {
    ElMessage.warning('JSON 格式不正确：' + e.message);
  }
}

function resetSectionTimes() {
  sectionTimesText.value = DEFAULT_SECTION_TIMES;
}

async function doBackup() {
  backingUp.value = true;
  try {
    const r = await createBackup();
    ElMessage.success(`备份完成：${r.name}（${(r.size / 1024 / 1024).toFixed(2)} MB）`);
    backups.value = await getBackups();
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    backingUp.value = false;
  }
}

async function removeBackup(b) {
  await deleteBackup(b.name);
  ElMessage.success('已删除备份');
  backups.value = await getBackups();
}

function download(url) {
  const a = document.createElement('a');
  a.href = url; a.click();
}

onMounted(load);
</script>

<template>
  <el-row :gutter="14">
    <el-col :span="12">
      <!-- AI 设置 -->
      <div class="page-card" style="margin-bottom: 14px;">
        <h3 class="page-title">🤖 AI 模型设置（DeepSeek）</h3>
        <el-form label-width="100px">
          <el-form-item label="服务商">
            <el-select v-model="aiForm.provider" style="width: 220px">
              <el-option value="deepseek" label="DeepSeek（推荐）" />
              <el-option value="openai" label="OpenAI 兼容接口" />
            </el-select>
          </el-form-item>
          <el-form-item label="API Key">
            <el-input v-model="aiForm.apiKey" type="password" show-password
              :placeholder="settings.ai.hasKey ? '已配置（留空则保持不变）' : 'sk-...（必填）'" style="width: 320px" />
          </el-form-item>
          <el-form-item label="模型">
            <el-input v-model="aiForm.model" style="width: 320px" />
          </el-form-item>
          <el-form-item label="接口地址">
            <el-input v-model="aiForm.baseUrl" style="width: 320px" placeholder="https://api.deepseek.com" />
          </el-form-item>
          <el-form-item label="温度">
            <el-slider v-model="aiForm.temperature" :min="0" :max="1.5" :step="0.1" style="width: 320px" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveAi">保存 AI 设置</el-button>
            <el-button :loading="testing" @click="testAi">测试连接</el-button>
          </el-form-item>
        </el-form>
        <el-alert type="info" :closable="false" title="Key 仅保存在本机数据库中，不会上传任何云端服务。申请地址：https://platform.deepseek.com" />
      </div>

      <!-- 备份 -->
      <div class="page-card">
        <h3 class="page-title">💾 数据备份（本地）</h3>
        <div style="margin-bottom: 10px;">
          <el-button type="success" :loading="backingUp" @click="doBackup">立即备份</el-button>
          <span class="muted" style="margin-left: 10px">每天首次启动服务时会自动备份一次；数据库 + 附件全部打包为 zip</span>
        </div>
        <el-table :data="backups" size="small" border>
          <el-table-column prop="name" label="备份文件" />
          <el-table-column label="大小" width="90">
            <template #default="{ row }">{{ (row.size / 1024 / 1024).toFixed(2) }} MB</template>
          </el-table-column>
          <el-table-column prop="mtime" label="时间" width="150" />
          <el-table-column label="操作" width="130">
            <template #default="{ row }">
              <el-button size="small" text type="primary" @click="download(backupDownloadUrl(row.name))">下载</el-button>
              <el-button size="small" text type="danger" @click="removeBackup(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-col>

    <el-col :span="12">
      <!-- 专业配置 -->
      <div class="page-card" style="margin-bottom: 14px;">
        <h3 class="page-title">🎓 预置专业（AI 生成时选用）</h3>
        <div class="tag-box">
          <el-tag v-for="(m, i) in majors" :key="m" closable @close="majors.splice(i, 1)" size="large" style="margin: 0 8px 8px 0">{{ m }}</el-tag>
          <el-input v-model="newMajor" size="small" style="width: 180px" placeholder="输入新专业" @keyup.enter="addMajor">
            <template #append><el-button @click="addMajor">添加</el-button></template>
          </el-input>
        </div>
        <el-button type="primary" size="small" @click="saveMajors" style="margin-top: 6px">保存专业配置</el-button>
      </div>

      <!-- 节次时间表 -->
      <div class="page-card" style="margin-bottom: 14px;">
        <h3 class="page-title">⏰ 节次时间表（用于上课提醒与课表显示）</h3>
        <el-input v-model="sectionTimesText" type="textarea" :rows="10" style="font-family: Consolas, monospace" />
        <div style="margin-top: 8px">
          <el-button type="primary" size="small" @click="saveSectionTimes">保存时间表</el-button>
          <el-button size="small" @click="resetSectionTimes">恢复默认</el-button>
        </div>
      </div>

      <!-- 关于 -->
      <div class="page-card">
        <h3 class="page-title">ℹ️ 关于</h3>
        <p style="margin: 4px 0">{{ settings.app.name }} v{{ settings.app.version }}</p>
        <p class="muted" style="margin: 4px 0">单人本地使用 · 数据完全保存在本机 · 无需服务器</p>
        <p class="muted" style="margin: 4px 0">数据目录：server/data/（含 teachaid.db、uploads/、backups/），复制该目录即可整体迁移</p>
      </div>
    </el-col>
  </el-row>
</template>

<style scoped>
.tag-box { margin-bottom: 8px; }
</style>
