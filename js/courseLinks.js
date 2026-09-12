import { DB } from './dataLayer.js';
import { state } from './state.js';

function getCourseReference() {
  return new URLSearchParams(window.location.search).get('course')?.trim() || null;
}

export function isPublicCourseLink() {
  return new URLSearchParams(window.location.search).get('mode') === 'course';
}

export function getCourseShareUrl(course) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('course', course.id);
  return url.toString();
}

export function getPublicCourseUrl(course) {
  const url = new URL(getCourseShareUrl(course));
  url.searchParams.set('mode', 'course');
  return url.toString();
}

export async function selectCourseFromUrl() {
  const reference = state.requestedCourseRef || getCourseReference();
  if (!reference) return false;

  state.requestedCourseRef = reference;
  const courses = await DB.getCourses();
  const course = courses.find(item =>
    item.id === reference || item.code?.toLowerCase() === reference.toLowerCase()
  );

  if (!course) {
    alert('This course link is no longer valid. Please choose a course from the dashboard.');
    state.requestedCourseRef = null;
    return false;
  }

  state.currentCourseId = course.id;
  return true;
}

window.copyPublicCourseLink = async function (courseId) {
  const courses = await DB.getCourses();
  const course = courses.find(item => item.id === courseId);
  if (!course) {
    alert('This course is no longer available.');
    return;
  }

  const url = getPublicCourseUrl(course);
  if (!navigator.clipboard?.writeText) {
    window.prompt('Copy this public course link:', url);
    return;
  }

  await navigator.clipboard.writeText(url);
  alert(`Public course link copied for ${course.name}.`);
};
