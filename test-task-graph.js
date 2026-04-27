// ทดสอบ Task Graph พื้นฐาน
import { TaskGraph, type TaskDefinition } from './src/orchestration/task-graph.js';

const tasks = [
  {
    id: 'research',
    agentId: 'researcher',
    prompt: 'วิเคราะห์ปัญหาการส่งต่องานและเสนอวิธีแก้ไข',
    label: 'วิจัยปัญหา'
  },
  {
    id: 'plan',
    agentId: 'planner',
    prompt: 'จากผลการวิจัย {{results.research}} สร้างแผนการดำเนินงาน',
    depends: ['research'],
    label: 'วางแผน'
  },
  {
    id: 'execute',
    agentId: 'coder',
    prompt: 'ดำเนินตามแผน {{results.plan}} โดยใช้เครื่องมือที่มีอยู่',
    depends: ['plan'],
    label: 'ดำเนินการ'
  },
  {
    id: 'review',
    agentId: 'reviewer',
    prompt: 'ตรวจสอบผลลัพธ์จาก {{results.execute}} และแนะนำการปรับปรุง',
    depends: ['execute'],
    label: 'ตรวจสอบ'
  }
];

async function testTaskGraph() {
  console.log('🧪 Testing Task Graph...');
  
  try {
    const graph = new TaskGraph(tasks);
    console.log('✅ Task Graph created successfully');
    console.log('Ready tasks:', graph.readyTasks().map(n => n.def.id));
    
    // ทดสอบ dependency resolution
    console.log('\n📊 Testing dependency resolution:');
    console.log('Task "plan" dependencies:', tasks[1].depends);
    console.log('Task "execute" dependencies:', tasks[2].depends);
    console.log('Task "review" dependencies:', tasks[3].depends);
    
    // ทดสอบ prompt resolution
    console.log('\n📝 Testing prompt resolution:');
    const planPrompt = graph.resolvePrompt('plan');
    console.log('Plan prompt:', planPrompt);
    
    const executePrompt = graph.resolvePrompt('execute');
    console.log('Execute prompt:', executePrompt);
    
    console.log('\n✅ Task Graph test completed successfully');
  } catch (error) {
    console.error('❌ Task Graph test failed:', error.message);
  }
}

testTaskGraph();