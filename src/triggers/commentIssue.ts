import { omitBy } from "lodash";
import { ZObject, Bundle } from "zapier-platform-core";
import sample from "../samples/issueComment.json";

interface CommentsResponse {
  data: {
    comments: {
      nodes: {
        id: string;
        body: string;
        url: string;
        createdAt: string;
        resolvedAt: string | null;
        resolvingUser: {
          id: string;
          name: string;
          email: string;
          avatarUrl: string;
        } | null;
        issue: {
          id: string;
          identifier: string;
          title: string;
          url: string;
          team: {
            id: string;
            name: string;
          };
        };
        user: {
          id: string;
          email: string;
          name: string;
          avatarUrl: string;
        };
        parent: {
          id: string;
          body: string;
          createdAt: string;
          user: {
            id: string;
            email: string;
            name: string;
            avatarUrl: string;
          };
        } | null;
      }[];
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string;
      };
    };
  };
}

const getCommentList = () => async (z: ZObject, bundle: Bundle) => {
  const cursor = bundle.meta.page ? await z.cursor.get() : undefined;

  const variables = omitBy(
    {
      creatorId: bundle.inputData.creator_id,
      teamId: bundle.inputData.team_id,
      issueId: bundle.inputData.issue,
      after: cursor,
    },
    (v) => v === undefined
  );

  const filters = [];
  if ("creatorId" in variables) {
    filters.push(`{ user: { id: { eq: $creatorId } } }`);
  }
  if ("teamId" in variables) {
    filters.push(`{ issue: { team: { id: { eq: $teamId } } } }`);
  }
  if ("issueId" in variables) {
    filters.push(`{ issue: { id: { eq: $issueId } } }`);
  }

  const response = await z.request({
    url: "https://api.linear.app/graphql",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      authorization: bundle.authData.api_key,
    },
    body: {
      query: `
      query ZapierListComments(
        $after: String
        ${"creatorId" in variables ? "$creatorId: ID" : ""}
        ${"teamId" in variables ? "$teamId: ID" : ""}
        ${"issueId" in variables ? "$issueId: ID" : ""}
      ) {
        comments(
          first: 25
          after: $after
          ${
            filters.length > 0
              ? `
          filter: {
            and : [
              ${filters.join("\n              ")}
            ]
          }`
              : ""
          }
        ) {
          nodes {
            id
            body
            createdAt
            resolvedAt
            resolvingUser {
              id
              name
              email
              avatarUrl
            }
            issue {
              id
              identifier
              title
              url
              team {
                id
                name
              }
            }
            user {
              id
              email
              name
              avatarUrl
            }
            parent {
              id
              body
              createdAt
              user {
                id
                email
                name
                avatarUrl
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
      variables: variables,
    },
    method: "POST",
  });

  const data = (response.json as CommentsResponse).data;
  const comments = data.comments.nodes;

  // Set cursor for pagination
  if (data.comments.pageInfo.hasNextPage) {
    await z.cursor.set(data.comments.pageInfo.endCursor);
  }

  return comments.map((comment) => ({
    ...comment,
    id: `${comment.id}-${comment.createdAt}`,
    commentId: comment.id,
  }));
};

const getCommentListWithZohoDeskTicketId = () => async (z: ZObject, bundle: Bundle) => {
  const comments = await getCommentList()(z, bundle);

  return comments.filter((comment) => /^#\d+/.test(comment.issue.title) && comment.body.includes("#support"));
};

const comment = {
  noun: "Comment",

  operation: {
    inputFields: [
      {
        required: false,
        label: "Team",
        key: "team_id",
        helpText: "Only trigger on issue comments created to this team.",
        dynamic: "team.id.name",
        altersDynamicFields: true,
      },
      {
        required: false,
        label: "Creator",
        key: "creator_id",
        helpText: "Only trigger on issue comments added by this user.",
        dynamic: "user.id.name",
        altersDynamicFields: true,
      },
      {
        required: false,
        label: "Issue ID",
        key: "issue",
        helpText: "Only trigger on comments added to this issue identified by its ID.",
      },
    ],
    sample,
  },
};

export const newIssueComment = {
  ...comment,
  key: "newComment",
  display: {
    label: "New Issue Comment",
    description: "Triggers when a new issue comment is created.",
    hidden: true,
  },
  operation: {
    ...comment.operation,
    perform: getCommentList(),
    canPaginate: true,
  },
};

export const newIssueCommentWithZohoDeskTicketId = {
  ...comment,
  key: "newCommentWithZohoDeskTicketId",
  display: {
    label: "New Issue Comment With Zoho Desk Ticket ID",
    description: "Triggers when a new issued comment is created to an issue with a Zoho Desk ticket ID.",
  },
  operation: {
    ...comment.operation,
    perform: getCommentListWithZohoDeskTicketId(),
    canPaginate: true,
  },
};
