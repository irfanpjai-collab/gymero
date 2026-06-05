export const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { value: 'lunch', label: 'Lunch', emoji: '☀️' },
  { value: 'dinner', label: 'Dinner', emoji: '🌙' },
  { value: 'snack', label: 'Snack', emoji: '🍎' },
  { value: 'pre_workout', label: 'Pre-Workout', emoji: '💪' },
  { value: 'post_workout', label: 'Post-Workout', emoji: '🥤' },
] as const

export const WORKOUT_TYPES = [
  { value: 'push', label: 'Push Day', description: 'Chest, Shoulders, Triceps' },
  { value: 'pull', label: 'Pull Day', description: 'Back, Biceps' },
  { value: 'legs', label: 'Leg Day', description: 'Quads, Hamstrings, Calves' },
  { value: 'full_body', label: 'Full Body', description: 'All muscle groups' },
  { value: 'cardio', label: 'Cardio', description: 'Cardiovascular training' },
  { value: 'rest', label: 'Rest Day', description: 'Active recovery' },
  { value: 'custom', label: 'Custom', description: 'Custom workout' },
] as const

export const FITNESS_GOALS = [
  { value: 'lose_weight', label: 'Lose Weight' },
  { value: 'maintain', label: 'Maintain Weight' },
  { value: 'gain_muscle', label: 'Gain Muscle' },
  { value: 'improve_fitness', label: 'Improve Fitness' },
] as const

export const INVENTORY_CATEGORIES = [
  'Proteins',
  'Carbohydrates',
  'Vegetables',
  'Fruits',
  'Dairy',
  'Supplements',
  'Condiments',
  'Other',
] as const

export const DEFAULT_EXERCISES = {
  push: ['Bench Press', 'Overhead Press', 'Incline Press', 'Lateral Raises', 'Tricep Pushdowns', 'Chest Flyes'],
  pull: ['Pull-ups', 'Barbell Rows', 'Lat Pulldowns', 'Face Pulls', 'Bicep Curls', 'Seated Rows'],
  legs: ['Squats', 'Romanian Deadlifts', 'Leg Press', 'Lunges', 'Leg Curls', 'Calf Raises'],
  full_body: ['Deadlifts', 'Squats', 'Bench Press', 'Pull-ups', 'Overhead Press', 'Rows'],
} as const
