import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import type {
  SyncTripGroupsRequestDto,
  SyncTripGroupsResponseDto,
  TripGroupDto,
  TripGroupMemberDto,
  TripGroupsListResponseDto,
} from "./dto/trip-groups.dto";

function parseDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`Invalid ${field}`);
  }
  return date;
}

function parseOptionalDate(value: string | null, field: string): Date | null {
  return value ? parseDate(value, field) : null;
}

@Injectable()
export class TripGroupsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(userId: string): Promise<TripGroupsListResponseDto> {
    const groups = await this.db.tripGroup.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
    });
    const activeGroupIds = groups.map((group) => group.clientGroupId);
    const members =
      activeGroupIds.length === 0
        ? []
        : await this.db.tripGroupMember.findMany({
            where: { userId, removedAt: null, clientGroupId: { in: activeGroupIds } },
            orderBy: [{ clientGroupId: "asc" }, { orderIndex: "asc" }],
          });

    return {
      groups: groups.map<TripGroupDto>((group) => ({
        clientGroupId: group.clientGroupId,
        title: group.title,
        description: group.description,
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
        deletedAt: group.deletedAt?.toISOString() ?? null,
      })),
      members: members.map<TripGroupMemberDto>((member) => ({
        clientMemberId: member.clientMemberId,
        clientGroupId: member.clientGroupId,
        clientTripId: member.clientTripId,
        orderIndex: member.orderIndex,
        addedAt: member.addedAt.toISOString(),
        updatedAt: member.updatedAt.toISOString(),
        removedAt: member.removedAt?.toISOString() ?? null,
      })),
    };
  }

  async sync(userId: string, body: SyncTripGroupsRequestDto): Promise<SyncTripGroupsResponseDto> {
    const groups = Array.isArray(body.groups) ? body.groups : [];
    const members = Array.isArray(body.members) ? body.members : [];
    const groupIds = new Set(groups.map((group) => group.clientGroupId));

    for (const member of members) {
      groupIds.add(member.clientGroupId);
    }

    const existingGroups = await this.db.tripGroup.findMany({
      where: { userId, clientGroupId: { in: [...groupIds] } },
      select: { clientGroupId: true },
    });
    const ownedGroupIds = new Set(existingGroups.map((group) => group.clientGroupId));

    for (const group of groups) {
      ownedGroupIds.add(group.clientGroupId);
    }
    for (const member of members) {
      if (!ownedGroupIds.has(member.clientGroupId)) {
        throw new BadRequestException("Group does not belong to user");
      }
    }

    const tripIds = [...new Set(members.map((member) => member.clientTripId))];
    if (tripIds.length > 0) {
      const trips = await this.db.trip.findMany({
        where: { userId, clientTripId: { in: tripIds }, deletedAt: null },
        select: { clientTripId: true },
      });
      const ownedTripIds = new Set(trips.map((trip) => trip.clientTripId));
      for (const tripId of tripIds) {
        if (!ownedTripIds.has(tripId)) {
          throw new BadRequestException("Trip must be synced before grouping");
        }
      }
    }

    await this.db.$transaction(async (tx) => {
      for (const group of groups) {
        await tx.tripGroup.upsert({
          where: { clientGroupId: group.clientGroupId },
          create: {
            clientGroupId: group.clientGroupId,
            userId,
            title: group.title,
            description: group.description,
            createdAt: parseDate(group.createdAt, "createdAt"),
            updatedAt: parseDate(group.updatedAt, "updatedAt"),
            deletedAt: parseOptionalDate(group.deletedAt, "deletedAt"),
          },
          update: {
            title: group.title,
            description: group.description,
            updatedAt: parseDate(group.updatedAt, "updatedAt"),
            deletedAt: parseOptionalDate(group.deletedAt, "deletedAt"),
          },
        });
      }

      for (const member of members) {
        await tx.tripGroupMember.upsert({
          where: { clientMemberId: member.clientMemberId },
          create: {
            clientMemberId: member.clientMemberId,
            clientGroupId: member.clientGroupId,
            clientTripId: member.clientTripId,
            userId,
            orderIndex: member.orderIndex,
            addedAt: parseDate(member.addedAt, "addedAt"),
            updatedAt: parseDate(member.updatedAt, "updatedAt"),
            removedAt: parseOptionalDate(member.removedAt, "removedAt"),
          },
          update: {
            orderIndex: member.orderIndex,
            updatedAt: parseDate(member.updatedAt, "updatedAt"),
            removedAt: parseOptionalDate(member.removedAt, "removedAt"),
          },
        });
      }
    });

    return {
      syncedGroupIds: groups.map((group) => group.clientGroupId),
      syncedMemberIds: members.map((member) => member.clientMemberId),
    };
  }
}
