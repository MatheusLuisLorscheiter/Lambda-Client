const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildComparison,
  normalizeAssessment
} = require('../routes/process-effort.routes');

test('normalizes a flexible effort assessment with multiple roles', () => {
  const assessment = normalizeAssessment({
    stage: 'baseline',
    label: 'Operação atual',
    measuredAt: '2026-07-28',
    source: 'observed',
    status: 'confirmed',
    notes: 'Semana representativa',
    items: [
      {
        activityName: 'Conferir pedidos',
        roleName: 'Analista financeiro',
        executionTimeMinutes: 20,
        executionsPerPeriod: 10,
        periodUnit: 'day',
        peopleCount: 2,
        monthlyHoursPerEmployee: 176
      },
      {
        activityName: 'Fechamento',
        roleName: 'Coordenador',
        executionTimeMinutes: 120,
        executionsPerPeriod: 1,
        periodUnit: 'month',
        peopleCount: 1,
        monthlyHoursPerEmployee: 176
      }
    ]
  });

  assert.equal(assessment.items.length, 2);
  assert.equal(assessment.items[0].peopleCount, 2);
  assert.equal(assessment.items[1].sortOrder, 1);
});

test('rejects zero time, frequency or people count', () => {
  assert.throws(
    () => normalizeAssessment({
      stage: 'baseline',
      label: 'Inválida',
      measuredAt: '2026-07-28',
      source: 'estimated',
      status: 'draft',
      items: [{
        activityName: 'Atividade',
        executionTimeMinutes: 0,
        executionsPerPeriod: 1,
        periodUnit: 'month',
        peopleCount: 1,
        monthlyHoursPerEmployee: 176
      }]
    }),
    /Tempo de execução/
  );
});

test('compares confirmed before and after assessments in monthly hours and FTE', () => {
  const comparison = buildComparison([
    {
      id: 2,
      stage: 'post_automation',
      label: 'Após automação',
      measuredAt: '2026-09-30',
      status: 'confirmed',
      items: [{
        id: 20,
        executionTimeMinutes: 5,
        executionsPerPeriod: 10,
        periodUnit: 'day',
        peopleCount: 1,
        monthlyHoursPerEmployee: 176
      }]
    },
    {
      id: 1,
      stage: 'baseline',
      label: 'Antes',
      measuredAt: '2026-07-28',
      status: 'confirmed',
      items: [{
        id: 10,
        executionTimeMinutes: 30,
        executionsPerPeriod: 10,
        periodUnit: 'day',
        peopleCount: 2,
        monthlyHoursPerEmployee: 176
      }]
    }
  ]);

  assert.equal(comparison.baseline.workHoursPerMonth, 220);
  assert.equal(comparison.postAutomation.workHoursPerMonth, 18.33);
  assert.equal(comparison.savings.monthlyHours, 201.67);
  assert.equal(comparison.savings.annualHours, 2420.04);
  assert.equal(comparison.savings.reductionPercent, 91.7);
});

test('uses the latest confirmed measurement instead of a newer draft', () => {
  const comparison = buildComparison([
    {
      id: 3,
      stage: 'baseline',
      label: 'Rascunho novo',
      measuredAt: '2026-08-01',
      status: 'draft',
      items: [{
        executionTimeMinutes: 1,
        executionsPerPeriod: 1,
        periodUnit: 'month',
        peopleCount: 1,
        monthlyHoursPerEmployee: 176
      }]
    },
    {
      id: 2,
      stage: 'baseline',
      label: 'Confirmada',
      measuredAt: '2026-07-28',
      status: 'confirmed',
      items: [{
        executionTimeMinutes: 60,
        executionsPerPeriod: 10,
        periodUnit: 'month',
        peopleCount: 1,
        monthlyHoursPerEmployee: 176
      }]
    }
  ]);

  assert.equal(comparison.baseline.assessmentId, 2);
  assert.equal(comparison.baseline.workHoursPerMonth, 10);
});
