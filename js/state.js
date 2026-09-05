// Central mutable app state. Modules import `state` and read/write fields on it
// rather than passing everything around as function arguments.
export const state = {
  currentStudent: null,
  currentCourseId: null,
  currentTopicId: null,     // null = "full course" mode for exam/flashcards
  currentTopicName: null,

  // exam engine
  activeQuestions: [],
  userSelections: [],
  currentQIndex: 0,
  examActive: false,
  practiceActive: false,
  isFinalizing: false,
  timerInterval: null,
  secondsLeft: 30 * 60,
  examStartedAt: null,

  // admin panel editing cursors (null = "add" mode, else "edit" mode)
  editingCourseId: null,
  editingTopicId: null,
  editingQuestionId: null,
  adminSelectedCourseId: null,
  adminSelectedTopicId: null,

  pendingAction: null // used by requireCourseThen()
};
