
import { Phase } from '../types';

export const coursePhases: Phase[] = [
  {
    id: 'p1',
    title: '基础阶段',
    status: 'IN_PROGRESS',
    overview: {
      experience: '你将配置Python环境，编写第一行代码，并首次尝试让大语言模型解释你的代码。',
      gains: '掌握Python基础语法，理解Prompt工程的基本原理，建立与AI协作编码的信心。',
      necessity: '这是通往计算社会科学的基石，没有基础的编程能力，就无法利用大模型的强大算力。',
      journey: '从环境搭建到Hello World，再到使用Pandas处理简单的表格数据。'
    },
    chapters: [
      {
        id: 'c1',
        title: '1. Python基础',
        status: 'IN_PROGRESS',
        colabLink: 'https://colab.research.google.com/',
        initialMessage: `欢迎来到 Pandas 数据处理基础学习！👋
很高兴认识你！我是你的学习伙伴，我们将一起探索 Python 中最强大的数据分析工具——Pandas。

## 这一章我们要学什么？
在接下来的学习中，你将掌握：

- 📂 **加载数据**：用 Pandas 读取 CSV 文件
- 🔍 **探索数据**：了解数据的结构和特征
- 📊 **分析数据**：计算统计信息
- 🎯 **过滤数据**：根据条件筛选你需要的数据

现在让我们开始吧！

## pandas安装
首先，我需要确认一下你的准备工作。请告诉我：

**你的 Python 环境中是否已经安装了 Pandas？**

你可以通过在 Python 中运行以下代码来检查：

\`\`\`python
import pandas as pd
print(pd.__version__)
\`\`\`

如果成功打印出版本号（比如 1.3.0），说明 Pandas 已经安装好了。如果出现 \`ModuleNotFoundError\` 错误，说明还需要安装。

请尝试运行上面的代码，然后告诉我：
1. 你运行了什么
2. 你看到了什么结果
3. 是否遇到了任何错误`,
        roadmap: {
          currentTask: '加载CSV文件（load_csv）',
          nextAdvice: '等待学习者运行Pandas版本检查代码，并根据结果决定是否需要安装或升级Pandas。',
          statusSummary: {
            round: 0,
            learnerState: '理解良好：尚未开始实际操作，等待学习者反馈'
          },
          sections: [
            {
              title: '任务状态',
              items: [
                { 
                  id: 't1', 
                  title: '🔄 加载CSV文件', 
                  status: 'IN_PROGRESS', 
                  description: 'load_csv',
                  subItems: [
                    { id: 'p1', title: '检查环境', status: 'IN_PROGRESS', description: '正在检查Python环境中是否安装了Pandas' },
                    { id: 'p2', title: '准备代码', status: 'IN_PROGRESS', description: '准备运行版本检查代码' },
                    { id: 'p3', title: '就绪确认', status: 'LOCKED', description: '确认环境准备就绪后开始数据加载' }
                  ]
                }
              ]
            },
            {
              title: '📋 未来任务',
              items: [
                { id: 'f1', title: '探索数据基本信息', status: 'LOCKED', description: 'explore_basic' },
                { id: 'f2', title: '计算统计信息', status: 'LOCKED', description: 'compute_stats' },
                { id: 'f3', title: '过滤数据', status: 'LOCKED', description: 'filter_data' },
                { id: 'f4', title: '排序数据', status: 'LOCKED', description: 'sort_data' },
                { id: 'f5', title: '分组数据', status: 'LOCKED', description: 'group_data' }
              ]
            }
          ]
        },
        resources: [
          { title: 'Python安装指南.pdf', type: 'pdf', url: '#' },
          { title: 'Pandas速查表.pdf', type: 'pdf', url: '#' }
        ],
        lessons: [
          { id: 'l1', title: '环境搭建与 Hello World' },
          { id: 'l2', title: 'Pandas 基础操作' }
        ]
      },
      {
        id: 'c2',
        title: '2. 认识大语言模型',
        status: 'LOCKED',
        initialMessage: '欢迎来到第二章。我们将深入探讨 LLM 的工作原理。',
        roadmap: { currentTask: '', nextAdvice: '', sections: [], statusSummary: { round: 0, learnerState: '' } },
        resources: [],
        lessons: []
      },
      {
        id: 'c3',
        title: '3. 尝试用代码和大语言模型交互',
        status: 'LOCKED',
        initialMessage: '本章我们将使用 OpenAI API 进行第一次交互。',
        roadmap: { currentTask: '', nextAdvice: '', sections: [], statusSummary: { round: 0, learnerState: '' } },
        resources: [],
        lessons: []
      }
    ]
  },
  {
    id: 'p2',
    title: '启动阶段',
    status: 'LOCKED',
    overview: {
      experience: '体验完整的社会科学研究流程数字化。',
      gains: '理解数据驱动的研究范式。',
      necessity: '连接理论与实践的桥梁。',
      journey: '全过程概览 -> 数据思维建立。'
    },
    chapters: [
      { id: 'c4', title: '4. 社会科学研究的大模型全过程助力', status: 'LOCKED', initialMessage: '', roadmap: { currentTask: '', nextAdvice: '', sections: [], statusSummary: { round: 0, learnerState: '' } }, resources: [], lessons: [] },
      { id: 'c5', title: '5. 大模型时代的数据思维', status: 'LOCKED', initialMessage: '', roadmap: { currentTask: '', nextAdvice: '', sections: [], statusSummary: { round: 0, learnerState: '' } }, resources: [], lessons: [] }
    ]
  },
  {
    id: 'p3',
    title: '应用阶段',
    status: 'LOCKED',
    overview: {
      experience: '深入具体的社科应用场景。',
      gains: '掌握文本标注、预测、因果推断和仿真技能。',
      necessity: '解决实际研究问题的核心工具箱。',
      journey: '标注 -> 预测 -> 因果 -> 模拟。'
    },
    chapters: [
      { id: 'c6', title: '6. 大模型辅助文本标注', status: 'LOCKED', initialMessage: '', roadmap: { currentTask: '', nextAdvice: '', sections: [], statusSummary: { round: 0, learnerState: '' } }, resources: [], lessons: [] },
      { id: 'c7', title: '7. 大模型与社会科学数据预测', status: 'LOCKED', initialMessage: '', roadmap: { currentTask: '', nextAdvice: '', sections: [], statusSummary: { round: 0, learnerState: '' } }, resources: [], lessons: [] },
      { id: 'c8', title: '8. 大语言模型与社会科学因果推断', status: 'LOCKED', initialMessage: '', roadmap: { currentTask: '', nextAdvice: '', sections: [], statusSummary: { round: 0, learnerState: '' } }, resources: [], lessons: [] },
      { id: 'c9', title: '9. 社会模拟与大模型智能体', status: 'LOCKED', initialMessage: '', roadmap: { currentTask: '', nextAdvice: '', sections: [], statusSummary: { round: 0, learnerState: '' } }, resources: [], lessons: [] }
    ]
  },
  {
    id: 'p4',
    title: '持续迭代',
    status: 'LOCKED',
    overview: {
      experience: '回顾与展望，展示你的成果。',
      gains: '形成个人项目集，建立终身学习路径。',
      necessity: '技术在变，学习能力不变。',
      journey: '学习 -> 展示。'
    },
    chapters: [
      { id: 'c10', title: '10. 持续学习', status: 'LOCKED', initialMessage: '', roadmap: { currentTask: '', nextAdvice: '', sections: [], statusSummary: { round: 0, learnerState: '' } }, resources: [], lessons: [] },
      { id: 'c11', title: '11. 我的项目呈现', status: 'LOCKED', initialMessage: '', roadmap: { currentTask: '', nextAdvice: '', sections: [], statusSummary: { round: 0, learnerState: '' } }, resources: [], lessons: [] }
    ]
  }
];
