export function Entity(..._args: any[]): ClassDecorator { return () => {}; }
export function PrimaryGeneratedColumn(..._args: any[]): PropertyDecorator { return () => {}; }
export function Column(..._args: any[]): PropertyDecorator { return () => {}; }
export function CreateDateColumn(..._args: any[]): PropertyDecorator { return () => {}; }
export function UpdateDateColumn(..._args: any[]): PropertyDecorator { return () => {}; }
export function DeleteDateColumn(..._args: any[]): PropertyDecorator { return () => {}; }
export function ManyToOne(..._args: any[]): PropertyDecorator { return () => {}; }
export function JoinColumn(..._args: any[]): PropertyDecorator { return () => {}; }
export function Index(..._args: any[]): ClassDecorator & PropertyDecorator { return () => {}; }
export class Repository<T> {
  find(..._args: any[]): any { return Promise.resolve([]); }
  findOne(..._args: any[]): any { return Promise.resolve(null); }
  findAndCount(..._args: any[]): Promise<[any[], number]> { return Promise.resolve([[], 0]); }
  save(..._args: any[]): any { return Promise.resolve({}); }
  create(..._args: any[]): any { return {}; }
  update(..._args: any[]): any { return Promise.resolve({ affected: 1 }); }
  count(..._args: any[]): any { return Promise.resolve(0); }
  createQueryBuilder(..._args: any[]): any { return null; }
  softDelete(..._args: any[]): any { return Promise.resolve(); }
  manager: any = { getRepository: (..._args: any[]) => new Repository() };
}
export class DataSource {
  getRepository(..._args: any[]): any { return new Repository(); }
}
export function MoreThanOrEqual(v: any) { return v; }
export function LessThan(v: any) { return v; }
export function IsNull() { return null; }
export function In(v: any) { return v; }
export class SelectQueryBuilder<T> {}
