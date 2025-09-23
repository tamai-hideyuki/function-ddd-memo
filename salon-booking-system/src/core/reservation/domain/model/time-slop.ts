export class TimeSlot {
  private readonly startTime: Date;
  private readonly endTime: Date;

  constructor(startTime: Date, endTime: Date) {
    if (!startTime || !endTime) {
      throw new Error('Start time and end time are required');
    }

    if (startTime >= endTime) {
      throw new Error('Start time must be before end time');
    }

    const duration = this.calculateDurationInMinutes(startTime, endTime);
    if (duration < 30) {
      throw new Error('Minimum time slot duration is 30 minutes');
    }

    if (duration > 240) {
      throw new Error('Maximum time slot duration is 4 hours');
    }

    if (startTime.getMinutes() % 15 !== 0 || endTime.getMinutes() % 15 !== 0) {
      throw new Error('Time slots must be in 15-minute increments');
    }

    this.startTime = new Date(startTime);
    this.endTime = new Date(endTime);
  }

  private calculateDurationInMinutes(start: Date, end: Date): number {
    return (end.getTime() - start.getTime()) / (1000 * 60);
  }

  getStartTime(): Date {
    return new Date(this.startTime);
  }

  getEndTime(): Date {
    return new Date(this.endTime);
  }

  getDurationInMinutes(): number {
    return this.calculateDurationInMinutes(this.startTime, this.endTime);
  }

  overlaps(other: TimeSlot): boolean {
    return this.startTime < other.endTime && this.endTime > other.startTime;
  }

  contains(time: Date): boolean {
    return time >= this.startTime && time < this.endTime;
  }

  equals(other: TimeSlot): boolean {
    return this.startTime.getTime() === other.startTime.getTime() &&
           this.endTime.getTime() === other.endTime.getTime();
  }

  toString(): string {
    const formatTime = (date: Date) => {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    return `${formatTime(this.startTime)} - ${formatTime(this.endTime)}`;
  }
}