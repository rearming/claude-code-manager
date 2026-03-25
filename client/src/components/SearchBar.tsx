import { observer } from 'mobx-react-lite';
import { Search } from 'lucide-react';
import { Input } from '@/components/shadcn/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/ui/select';
import type { SessionStore } from '../stores/SessionStore';

interface Props {
  store: SessionStore;
}

export const SearchBar = observer(({ store }: Props) => {
  return (
    <div className="px-4 py-3 border-b border-border space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
        <Input
          type="text"
          placeholder="search sessions..."
          value={store.searchQuery}
          onChange={(e) => store.setSearchQuery(e.target.value)}
          className="pl-8 h-8 text-sm bg-black/50"
        />
      </div>
      <Select
        value={store.projectFilter}
        onValueChange={(val) => store.setProjectFilter(val === '__all__' ? '' : val)}
      >
        <SelectTrigger className="w-full h-7 bg-black/50 text-sm text-zinc-300">
          <SelectValue placeholder="all projects" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">all projects</SelectItem>
          {store.projects.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={store.sortBy}
        onValueChange={(val) => store.setSortBy(val as 'date' | 'messages' | 'project')}
      >
        <SelectTrigger className="w-full h-7 bg-black/50 text-sm text-zinc-300">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="date">sort by date</SelectItem>
          <SelectItem value="messages">sort by messages</SelectItem>
          <SelectItem value="project">sort by project</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
});
