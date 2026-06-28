export const formatMessageTime = (createdAt: any): string => {
  if (!createdAt) return "";
  try {
    let dateObj: Date;
    if (typeof createdAt.toDate === "function") {
      dateObj = createdAt.toDate();
    } else if (createdAt instanceof Date) {
      dateObj = createdAt;
    } else if (createdAt && typeof createdAt.seconds === "number") {
      dateObj = new Date(createdAt.seconds * 1000);
    } else if (typeof createdAt === "string" || typeof createdAt === "number") {
      dateObj = new Date(createdAt);
    } else {
      dateObj = new Date();
    }
    
    if (isNaN(dateObj.getTime())) {
      return "";
    }
    
    let hours = dateObj.getHours();
    const minutes = dateObj.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
  } catch (e) {
    return "";
  }
};

export const formatDateSeparator = (createdAt: any): string => {
  if (!createdAt) return "";
  try {
    let dateObj: Date;
    if (typeof createdAt.toDate === "function") {
      dateObj = createdAt.toDate();
    } else if (createdAt instanceof Date) {
      dateObj = createdAt;
    } else if (createdAt && typeof createdAt.seconds === "number") {
      dateObj = new Date(createdAt.seconds * 1000);
    } else if (typeof createdAt === "string" || typeof createdAt === "number") {
      dateObj = new Date(createdAt);
    } else {
      dateObj = new Date();
    }
    
    if (isNaN(dateObj.getTime())) {
      return "";
    }
    
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    
    const isSameDay = (d1: Date, d2: Date) => 
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();
      
    if (isSameDay(dateObj, today)) {
      return "Today";
    } else if (isSameDay(dateObj, yesterday)) {
      return "Yesterday";
    } else {
      return dateObj.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
  } catch (e) {
    return "";
  }
};

