// ทดสอบการส่งต่องานผ่าน Orchestrator
import { Orchestrator } from './src/orchestration/orchestrator.js';
import { TaskGraph, type TaskDefinition } from './src/orchestration/task-graph.js';

// Mock Agent Runtime สำหรับการทดสอบ
class MockAgentRuntime {
  async run(req) {
    console.log(`🤖 Running task on agent ${req.agentId}: ${req.userMessage}`);
    
    // จำลองการทำงานของแต่ละ agent
    switch(req.agentId) {
      case 'researcher':
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {
          success: true,
          content: 'การส่งต่องานคือกระบวนการที่ agent ตัวหนึ่งส่งงานไปให้ agent ตัวอื่นทำต่อ โดยมีการจัดลำดับและการพึ่งพากัน',
          durationMs: 1000
        };
      case 'planner':
        await new Promise(resolve => setTimeout(resolve, 800));
        return {
          success: true,
          content: 'แผนการดำเนินงาน: 1. วิเคราะห์ปัญหา 2. สร้างแผน 3. ดำเนินการ 4. ตรวจสอบผลลัพธ์',
          durationMs: 800
        };
      case 'coder':
        await new Promise(resolve => setTimeout(resolve, 1500));
        return {
          success: true,
          content: 'ดำเนินการเสร็จสิ้น: สร้างฟังก์ชันส่งต่องาน ทดสอบการทำงาน ปรับปรุงโค้ด',
          durationMs: 1500
        };
      case 'reviewer':
        await new Promise(resolve => setTimeout(resolve, 600));
        return {
          success: true,
          content: 'ผลลัพธ์การตรวจสอบ: โค้ดทำงานได้ตามที่กำหนด ควรเพิ่มการตรวจสอบข้อผิดพลาด',
          durationMs: 600
        };
      default:
        throw new Error(`Unknown agent: ${req.agentId}`);
    }
  }
}

async function testOrchestrator() {
  console.log('🧪 Testing Task Orchestrator...');
  
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

  try {
    const mockRuntime = new MockAgentRuntime();
    const orchestrator = new Orchestrator(mockRuntime);
    
    console.log('✅ Orchestrator created successfully');
    console.log('📋 Tasks to execute:', tasks.map(t => ({ id: t.id, agent: t.agentId, deps: t.depends })));
    
    const result = await orchestrator.run({
      tasks,
      maxConcurrent: 2,
      failFast: false
    });
    
    console.log('\n📊 Results:');
    console.log(`Success: ${result.success}`);
    console.log(`Total tasks: ${result.taskCount}`);
    console.log(`Done: ${result.doneCount}`);
    console.log(`Failed: ${result.failedCount}`);
    console.log(`Skipped: ${result.skippedCount}`);
    console.log(`Duration: ${result.totalDurationMs}ms`);
    console.log('\n📝 Task Summary:');
    console.log(result.summary);
    
    console.log('\n✅ Orchestrator test completed successfully');
  } catch (error) {
    console.error('❌ Orchestrator test failed:', error.message);
  }
}

testOrchestrator();